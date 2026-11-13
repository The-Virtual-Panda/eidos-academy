// Quizzes, decks, and courses kept just for one person (Academy REQ76 to REQ81), end to end in a
// sandbox of their own: written to the plugin's local folder, taken there, and shared or kept again.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { pluginSandbox, type PluginSandbox } from 'eidosmd/plugin-testing';
import { parse, stringify } from 'yaml';

let sandbox: PluginSandbox;
const SETTINGS = '.eidos/plugins/eidosmd/settings.yaml';
const LOCAL = '.eidos/plugins/academy/local';

async function json<T>(...args: string[]): Promise<T> {
  const run = await sandbox.run([...args, '--json'], { env: { EIDOS_USER: 'ada' } });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout) as T;
}

async function fails(...args: string[]): Promise<string> {
  const run = await sandbox.run(args, { env: { EIDOS_USER: 'ada' } });
  assert.notEqual(run.status, 0, `${args.join(' ')} should have been refused`);
  return run.stderr;
}

interface Item {
  id: string;
  path: string;
  course: string | null;
  local: boolean;
  created_by: string | null;
}

async function question(quiz: string, prompt: string): Promise<{ id: string }> {
  return json('academy', 'question', 'add', quiz, '--prompt', prompt, '--option', 'Right', '--option', 'Wrong', '--answer', '1', '--why', 'Because');
}

before(async () => {
  sandbox = await pluginSandbox('dist');
  const file = path.join(sandbox.root, SETTINGS);
  const settings = (parse(readFileSync(file, 'utf8')) ?? {}) as Record<string, unknown>;
  settings['users'] = [
    { name: 'Ada', alias: 'ada', email: 'ada@example.com' },
    { name: 'Bo', alias: 'bo', email: 'bo@example.com' },
    { name: 'Owner', alias: 'own', owner: true },
  ];
  writeFileSync(file, stringify(settings));
  // the page acts as whoever this machine acts as
  const local = path.join(sandbox.root, '.eidos/plugins/eidosmd/local.yaml');
  writeFileSync(local, stringify({ ...(parse(readFileSync(local, 'utf8')) as object), user: 'ada' }));
});
after(async () => {
  await sandbox.close();
});

test('a quiz made --local is written to the local folder, never the shared one, and listed as local', async () => {
  const quiz = await json<Item>('academy', 'quiz', 'new', 'Mine alone', '--local');
  assert.equal(quiz.local, true);
  assert.ok(quiz.path.startsWith(`${LOCAL}/academy/`), quiz.path);
  assert.ok(existsSync(path.join(sandbox.root, quiz.path)));
  assert.ok(!existsSync(path.join(sandbox.root, 'academy', path.basename(quiz.path))));
  const listed = await json<{ quizzes: Array<{ id: string; local: boolean }> }>('academy', 'list');
  assert.equal(listed.quizzes.find((row) => row.id === quiz.id)?.local, true);
  const run = await sandbox.run(['academy', 'list'], { env: { EIDOS_USER: 'ada' } });
  assert.match(run.stdout, new RegExp(`${quiz.id}  quiz  Mine alone  ·  one-off  ·  local`));
});

test("a local quiz is taken one way, its whole attempts counting as the person's scores, with nothing for anyone else", async () => {
  const quiz = await json<Item>('academy', 'quiz', 'new', 'Taken alone', '--local');
  const one = await question(quiz.id, 'One');
  const two = await question(quiz.id, 'Two');
  // whatever kind the page asks for, it stays on this machine
  const first = await sandbox.route<{ attempt: { id: string; kind: string; by: string }; first: boolean; average: number | null }>('POST', 'attempt', {
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
  assert.equal(first.attempt.kind, 'practice');
  assert.equal(first.first, true);
  assert.equal(first.average, null);
  assert.ok(existsSync(path.join(sandbox.root, LOCAL, 'results', first.attempt.by, `${first.attempt.id}.yaml`)));
  assert.ok(!existsSync(path.join(sandbox.root, '.eidos/plugins/academy/results')), 'nothing is committed');
  await sandbox.route('POST', 'attempt', { body: { quiz: quiz.id, kind: 'practice', mode: 'missed', answers: [{ question: two.id, chosen: 0 }] } });
  const second = await sandbox.route<{ new_best: boolean; official_attempts: number }>('POST', 'attempt', {
    body: {
      quiz: quiz.id,
      kind: 'practice',
      mode: 'whole',
      answers: [
        { question: one.id, chosen: 0 },
        { question: two.id, chosen: 0 },
      ],
    },
  });
  assert.equal(second.new_best, true);
  assert.equal(second.official_attempts, 2, 'a retry of the missed ones is no attempt at the whole quiz');

  const view = await sandbox.route<{
    scores: { best: { percent: number }; official_attempts: number; history: unknown[] };
    may: { results: boolean; take_official: boolean; keep: boolean };
    to_grade: number | null;
    guests: number | null;
  }>('GET', 'quiz', { query: { id: quiz.id } });
  assert.equal(view.scores.best.percent, 1);
  assert.equal(view.scores.official_attempts, 2);
  assert.equal(view.scores.history.length, 3);
  assert.deepEqual([view.may.results, view.may.take_official, view.may.keep, view.to_grade, view.guests], [false, false, false, null, null]);
  const overview = await sandbox.route<{ quizzes: Array<{ id: string; best: number | null }> }>('GET', 'overview');
  assert.equal(overview.quizzes.find((row) => row.id === quiz.id)?.best, 1);
  await assert.rejects(sandbox.route('GET', 'results', { query: { id: quiz.id } }), /just yours/);
  await assert.rejects(sandbox.route('GET', 'compare', { query: { id: quiz.id } }), /just yours/);
});

test("a course and what is in it are all the person's or all the project's", async () => {
  const mine = await json<Item>('academy', 'course', 'new', 'My course', '--local');
  assert.ok(mine.path.startsWith(`${LOCAL}/academy/my-course/`), mine.path);
  const inside = await json<Item>('academy', 'quiz', 'new', 'Inside it', '--course', mine.id);
  assert.equal(inside.local, true, "a quiz made in a local course is the person's too");
  assert.equal(path.posix.dirname(inside.path), path.posix.dirname(mine.path));
  const shared = await json<Item>('academy', 'course', 'new', 'Shared course');
  assert.match(await fails('academy', 'quiz', 'new', 'Wrong side', '--local', '--course', shared.id), /share the quiz with the project first/);
  const one = await json<Item>('academy', 'quiz', 'new', 'A shared one-off');
  assert.match(await fails('academy', 'quiz', 'set', one.id, '--course', mine.id), /just yours/);
});

test('a local course follows the person without enrolling', async () => {
  const course = await json<Item>('academy', 'course', 'new', 'Followed', '--local');
  const quiz = await json<Item>('academy', 'quiz', 'new', 'In the followed course', '--course', course.id);
  const one = await question(quiz.id, 'One');
  await sandbox.route('POST', 'attempt', { body: { quiz: quiz.id, kind: 'practice', mode: 'whole', answers: [{ question: one.id, chosen: 0 }] } });
  const view = await sandbox.route<{ may: { enroll: boolean; people: boolean }; progress: { taken: number; of: number } }>('GET', 'course', { query: { id: course.id } });
  assert.deepEqual([view.may.enroll, view.may.people, view.progress.taken, view.progress.of], [false, false, 1, 1]);
  const progress = await sandbox.route<{ enrolled_since: string | null; progress: { taken: number } }>('GET', 'course/progress', { query: { id: course.id } });
  assert.deepEqual([progress.enrolled_since, progress.progress.taken], [null, 1]);
  await assert.rejects(sandbox.route('POST', 'course/enroll', { query: { id: course.id } }), /without enrolling/);
});

test("a local deck's sessions stay on this machine, though the person has a name in the project", async () => {
  const deck = await json<Item>('academy', 'deck', 'new', 'My cards', '--local');
  const card = await json<{ id: string }>('academy', 'card', 'add', deck.id, '--front', 'Front', '--back', 'Back');
  const saved = await sandbox.route<{ shared: boolean }>('POST', 'study', {
    body: { mode: 'next', started_at: new Date().toISOString(), answers: [{ deck: deck.id, card: card.id, got: true }] },
  });
  assert.equal(saved.shared, false);
  assert.equal(readdirSync(path.join(sandbox.root, LOCAL, 'reviews', 'ada')).length, 1);
  assert.ok(!existsSync(path.join(sandbox.root, '.eidos/plugins/academy/results/ada/reviews')));
});

test('sharing moves a local course with everything in it into the project, ids kept and attempts left as practice', async () => {
  const course = await json<Item>('academy', 'course', 'new', 'To share', '--local');
  const quiz = await json<Item>('academy', 'quiz', 'new', 'Shared later', '--course', course.id);
  const deck = await json<Item>('academy', 'deck', 'new', 'Cards shared later', '--course', course.id);
  const one = await question(quiz.id, 'One');
  const taken = await sandbox.route<{ attempt: { id: string; by: string } }>('POST', 'attempt', {
    body: { quiz: quiz.id, kind: 'practice', mode: 'whole', answers: [{ question: one.id, chosen: 0 }] },
  });

  const done = await json<{ kind: string; id: string; moved: number; local: boolean }>('academy', 'share', course.id);
  assert.deepEqual([done.kind, done.moved, done.local], ['course', 2, false]);
  const listed = await json<{ quizzes: Item[]; decks: Item[]; courses: Array<{ id: string; local: boolean }> }>('academy', 'list');
  const moved = listed.quizzes.find((row) => row.id === quiz.id)!;
  assert.equal(moved.local, false);
  assert.ok(moved.path.startsWith('academy/to-share/'), moved.path);
  assert.equal(listed.decks.find((row) => row.id === deck.id)?.local, false);
  assert.equal(listed.courses.find((row) => row.id === course.id)?.local, false);
  assert.ok(!existsSync(path.join(sandbox.root, path.posix.dirname(course.path))), 'nothing is left behind in the local folder');
  assert.match(readFileSync(path.join(sandbox.root, moved.path), 'utf8'), /created_by: ada/);
  const attempt = readFileSync(path.join(sandbox.root, LOCAL, 'results', taken.attempt.by, `${taken.attempt.id}.yaml`), 'utf8');
  assert.match(attempt, /kind: practice/, 'what was taken alone is never posted as official');
  assert.match(await fails('academy', 'share', quiz.id), /already the project's/);
});

test("keeping a shared one just for oneself is refused while someone's history is with it", async () => {
  const quiz = await json<Item>('academy', 'quiz', 'new', 'Taken officially');
  const one = await question(quiz.id, 'One');
  await sandbox.route('POST', 'attempt', { body: { quiz: quiz.id, kind: 'official', mode: 'whole', answers: [{ question: one.id, chosen: 0 }] } });
  assert.match(await fails('academy', 'keep', quiz.id), /Ada has taken Taken officially officially, so it stays with the project/);
  const view = await sandbox.route<{ may: { keep: boolean; keep_why: string | null } }>('GET', 'quiz', { query: { id: quiz.id } });
  assert.deepEqual([view.may.keep, view.may.keep_why], [true, 'Ada has taken Taken officially officially']);

  const fresh = await json<Item>('academy', 'quiz', 'new', 'Mine again');
  await question(fresh.id, 'One');
  const kept = await json<{ local: boolean }>('academy', 'keep', fresh.id);
  assert.equal(kept.local, true);
  const listed = await json<{ quizzes: Item[] }>('academy', 'list');
  const now = listed.quizzes.find((row) => row.id === fresh.id)!;
  assert.ok(now.path.startsWith(`${LOCAL}/academy/`), now.path);
  assert.ok(!existsSync(path.join(sandbox.root, fresh.path)));
});

test("someone who does not hold a shared quiz can't keep it", async () => {
  const quiz = await json<Item>('academy', 'quiz', 'new', "Bo's", '--created-by', 'bo');
  assert.match(await fails('academy', 'keep', quiz.id), /creator and the project's owners/);
});
