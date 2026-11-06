// The plugin end to end, in a sandbox the testing kit makes: a root and an app data
// folder of the test's own, with dist/ linked, switched on, and allowed.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { pluginSandbox, type PluginSandbox } from 'eidosmd/plugin-testing';
import { parse, stringify } from 'yaml';

let sandbox: PluginSandbox;
const SETTINGS = '.eidos/plugins/eidosmd/settings.yaml';

async function json<T>(...args: string[]): Promise<T> {
  const run = await sandbox.run([...args, '--json'], { env: { EIDOS_USER: 'ada' } });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout) as T;
}

interface Quiz {
  id: string;
  path: string;
  course: string | null;
  rank: number;
  questions: Array<{ id: string; answer: number }>;
}

async function question(quiz: string, prompt: string, answer = 1): Promise<{ id: string }> {
  return json('quizzes', 'question', 'add', quiz, '--prompt', prompt, '--option', 'Right', '--option', 'Wrong', '--answer', String(answer), '--why', 'Because');
}

before(async () => {
  sandbox = await pluginSandbox('dist');
  const file = path.join(sandbox.root, SETTINGS);
  const settings = (parse(readFileSync(file, 'utf8')) ?? {}) as Record<string, unknown>;
  settings['users'] = [
    { name: 'Ada', alias: 'ada', email: 'ada@example.com' },
    { name: 'Bo', alias: 'bo', email: 'bo@example.com' },
    { name: 'Owner', alias: 'own', owner: true },
    { name: 'Agent', alias: 'agent', agent: true },
  ];
  writeFileSync(file, stringify(settings));
  // the page acts as whoever this machine acts as
  const local = path.join(sandbox.root, '.eidos/plugins/eidosmd/local.yaml');
  writeFileSync(local, stringify({ ...(parse(readFileSync(local, 'utf8')) as object), user: 'ada' }));
});
after(async () => {
  await sandbox.close();
});

test('a quiz is written from the shell as a page a person can read', async () => {
  const quiz = await json<Quiz>('quizzes', 'new', 'Lesson one', '--draws-from', 'B-NOPE');
  await question(quiz.id, 'What is asked?');
  const shown = await json<Quiz>('quizzes', 'show', quiz.id);
  assert.equal(shown.questions.length, 1);
  assert.equal(shown.questions[0]!.answer, 0);
  const text = readFileSync(path.join(sandbox.root, shown.path), 'utf8');
  assert.match(text, /created_by: ada/);
  assert.match(text, /- \[x\] Right/);
  assert.match(text, /\*\*Why:\*\* Because/);
});

test('the check reports a source that is gone', async () => {
  const run = await sandbox.run(['check']);
  assert.match(run.stdout + run.stderr, /draws from B-NOPE, which is gone/);
});

test('a question with no answer is refused', async () => {
  const quiz = await json<Quiz>('quizzes', 'new', 'Refusals');
  const run = await sandbox.run(['quizzes', 'question', 'add', quiz.id, '--prompt', 'P', '--option', 'A', '--option', 'B'], { env: { EIDOS_USER: 'ada' } });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /none of its options is marked as the answer/);
});

test('regenerating gives a question a new id, and editing keeps it', async () => {
  const quiz = await json<Quiz>('quizzes', 'new', 'Regenerate');
  const first = await question(quiz.id, 'Old');
  const edited = await json<{ id: string }>('quizzes', 'question', 'set', quiz.id, first.id, '--prompt', 'Edited');
  assert.equal(edited.id, first.id);
  const fresh = await json<{ id: string }>('quizzes', 'question', 'set', quiz.id, first.id, '--prompt', 'New', '--regenerated');
  assert.notEqual(fresh.id, first.id);
});

test('courses order their quizzes, and a course removed leaves one-offs', async () => {
  const course = await json<{ id: string; path: string }>('quizzes', 'course', 'new', 'A course');
  const a = await json<Quiz>('quizzes', 'new', 'First', '--course', course.id);
  const b = await json<Quiz>('quizzes', 'new', 'Second', '--course', course.id);
  assert.equal(a.rank, 1);
  assert.equal(b.rank, 2);
  await json('quizzes', 'set', b.id, '--place', '1');
  const shown = await json<{ quizzes: Array<{ id: string; place: number }> }>('quizzes', 'course', 'show', course.id);
  assert.deepEqual(
    shown.quizzes.map((row) => row.id),
    [b.id, a.id],
  );
  assert.equal(path.dirname(b.path), path.dirname(course.path), 'reordering renames nothing');

  await json('quizzes', 'course', 'remove', course.id);
  const moved = await json<Quiz>('quizzes', 'show', a.id);
  assert.equal(moved.course, null);
  assert.equal(moved.id, a.id);
  assert.ok(!existsSync(path.join(sandbox.root, path.dirname(course.path))));
});

test('an official attempt is committed, a practice attempt stays local, and copies survive a regenerate', async () => {
  const quiz = await json<Quiz>('quizzes', 'new', 'Attempts', '--created-by', 'bo', '--open');
  const one = await question(quiz.id, 'One');
  const two = await question(quiz.id, 'Two');

  const official = await sandbox.route<{ attempt: { id: string; by: string; score: number; total: number }; first: boolean }>('POST', 'attempt', {
    body: {
      quiz: quiz.id,
      kind: 'official',
      mode: 'whole',
      answers: [
        { question: one.id, chosen: 0 },
        { question: two.id, chosen: 1 },
      ],
    },
  });
  assert.equal(official.attempt.by, 'ada');
  assert.equal(official.first, true);
  assert.equal(official.attempt.score, 1);
  assert.equal(official.attempt.total, 2);
  const folder = path.join(sandbox.root, '.eidos/plugins/quizzes/results', official.attempt.by);
  assert.equal(readdirSync(folder).filter((name) => name.endsWith('.yaml')).length, 1);

  const practice = await sandbox.route<{ attempt: { id: string; by: string } }>('POST', 'attempt', {
    body: { quiz: quiz.id, kind: 'practice', mode: 'missed', answers: [{ question: two.id, chosen: 0 }] },
  });
  assert.ok(existsSync(path.join(sandbox.root, '.eidos/plugins/quizzes/local/results', practice.attempt.by, `${practice.attempt.id}.yaml`)));
  assert.equal(readdirSync(folder).filter((name) => name.endsWith('.yaml')).length, 1, 'practice is never with the committed results');

  await json('quizzes', 'question', 'set', quiz.id, one.id, '--prompt', 'Replaced', '--regenerated');
  const again = await sandbox.route<{ answers: Array<{ question: { prompt: string } }> }>('GET', 'attempt', { query: { id: quiz.id, attempt: official.attempt.id } });
  assert.equal(again.answers[0]!.question.prompt, 'One', 'an attempt keeps the question as it was asked');

  const whole = await sandbox.route('POST', 'attempt', { body: { quiz: quiz.id, kind: 'official', mode: 'missed', answers: [{ question: two.id, chosen: 0 }] } }).catch((cause: Error) => cause);
  assert.match(String((whole as Error).message), /whole quiz/);
});

test('results are shown to the creator, proctors, and owners, and totals to everyone', async () => {
  const quiz = await json<Quiz>('quizzes', 'new', 'Shown', '--created-by', 'bo');
  await question(quiz.id, 'One');
  const asAda = await sandbox.run(['quizzes', 'results', quiz.id, '--json'], { env: { EIDOS_USER: 'ada' } });
  assert.equal(JSON.parse(asAda.stdout).everyone, undefined);
  const asBo = await sandbox.run(['quizzes', 'results', quiz.id, '--json'], { env: { EIDOS_USER: 'bo' } });
  assert.deepEqual(JSON.parse(asBo.stdout).everyone, []);
  const asOwner = await sandbox.run(['quizzes', 'results', quiz.id, '--json'], { env: { EIDOS_USER: 'own' } });
  assert.deepEqual(JSON.parse(asOwner.stdout).everyone, []);

  await sandbox.run(['quizzes', 'set', quiz.id, '--add-proctor', 'ada'], { env: { EIDOS_USER: 'bo' } });
  const proctor = await sandbox.run(['quizzes', 'results', quiz.id, '--json'], { env: { EIDOS_USER: 'ada' } });
  assert.deepEqual(JSON.parse(proctor.stdout).everyone, []);

  const refused = await sandbox.run(['quizzes', 'set', quiz.id, '--add-proctor', 'nobody'], { env: { EIDOS_USER: 'bo' } });
  assert.match(refused.stderr, /not in the project's users/);
});

test('with no owner marked, or no user selected, everyone sees results and practice still saves', async () => {
  const quiz = await json<Quiz>('quizzes', 'new', 'Open to all', '--created-by', 'bo');
  const one = await question(quiz.id, 'One');
  const file = path.join(sandbox.root, SETTINGS);
  const held = readFileSync(file, 'utf8');
  const local = path.join(sandbox.root, '.eidos/plugins/eidosmd/local.yaml');
  const localHeld = readFileSync(local, 'utf8');
  try {
    const settings = parse(held) as { users: Array<Record<string, unknown>> };
    settings.users = settings.users.map(({ owner: _owner, ...user }) => user);
    writeFileSync(file, stringify(settings));
    const asAda = await sandbox.run(['quizzes', 'results', quiz.id, '--json'], { env: { EIDOS_USER: 'ada' } });
    assert.deepEqual(JSON.parse(asAda.stdout).everyone, [], 'no owner marked: ada sees results');

    writeFileSync(file, held);
    const { user: _user, ...unset } = parse(localHeld) as Record<string, unknown>;
    writeFileSync(local, stringify(unset));
    const asNobody = await sandbox.run(['quizzes', 'results', quiz.id, '--json'], { env: { EIDOS_USER: 'nobody-listed' } });
    assert.deepEqual(JSON.parse(asNobody.stdout).everyone, [], 'no user selected: results show');
    const practice = await sandbox.route<{ attempt: { by: string; score: number } }>('POST', 'attempt', {
      body: { quiz: quiz.id, kind: 'practice', mode: 'whole', answers: [{ question: one.id, chosen: 0 }] },
    });
    assert.equal(practice.attempt.by, 'local');
    assert.equal(practice.attempt.score, 1);
    const shown = await sandbox.route<{ may: { edit: boolean; results: boolean }; scores: { history: unknown[] } }>('GET', 'quiz', { query: { id: quiz.id } });
    assert.deepEqual([shown.may.edit, shown.may.results, shown.scores.history.length], [true, true, 1]);
  } finally {
    writeFileSync(file, held);
    writeFileSync(local, localHeld);
  }
});

test('a quiz starts closed: no official attempts, editors may try it out, and it opens once it has questions', async () => {
  const quiz = await json<Quiz & { status: string }>('quizzes', 'new', 'Not ready', '--created-by', 'bo');
  assert.equal(quiz.status, 'closed');
  const empty = await sandbox.run(['quizzes', 'set', quiz.id, '--status', 'open'], { env: { EIDOS_USER: 'bo' } });
  assert.match(empty.stderr, /add a question/);
  const one = await question(quiz.id, 'One');

  // the page acts as ada, who neither created it nor proctors it
  const body = (kind: string) => ({ quiz: quiz.id, kind, mode: 'whole', answers: [{ question: one.id, chosen: 0 }] });
  await assert.rejects(sandbox.route('POST', 'attempt', { body: body('official') }), /closed/);
  await assert.rejects(sandbox.route('POST', 'attempt', { body: body('practice') }), /closed/);

  await json('quizzes', 'set', quiz.id, '--add-proctor', 'ada');
  await assert.rejects(sandbox.route('POST', 'attempt', { body: body('official') }), /closed/);
  await sandbox.route('POST', 'attempt', { body: body('practice') });

  await json('quizzes', 'set', quiz.id, '--status', 'open');
  await sandbox.route('POST', 'attempt', { body: body('official') });
  assert.match(readFileSync(path.join(sandbox.root, quiz.path), 'utf8'), /status: open/);
});
