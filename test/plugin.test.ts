// The plugin end to end, in a sandbox the testing kit makes: a root and an app data
// folder of the test's own, with dist/ linked, switched on, and allowed.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  return json('academy', 'question', 'add', quiz, '--prompt', prompt, '--option', 'Right', '--option', 'Wrong', '--answer', String(answer), '--why', 'Because');
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
  const quiz = await json<Quiz>('academy', 'quiz', 'new', 'Lesson one', '--draws-from', 'B-NOPE');
  await question(quiz.id, 'What is asked?');
  const shown = await json<Quiz>('academy', 'quiz', 'show', quiz.id);
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
  const quiz = await json<Quiz>('academy', 'quiz', 'new', 'Refusals');
  const run = await sandbox.run(['academy', 'question', 'add', quiz.id, '--prompt', 'P', '--option', 'A', '--option', 'B'], { env: { EIDOS_USER: 'ada' } });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /none of its options is marked as the answer/);
});

test('regenerating gives a question a new id, and editing keeps it', async () => {
  const quiz = await json<Quiz>('academy', 'quiz', 'new', 'Regenerate');
  const first = await question(quiz.id, 'Old');
  const edited = await json<{ id: string }>('academy', 'question', 'set', quiz.id, first.id, '--prompt', 'Edited');
  assert.equal(edited.id, first.id);
  const fresh = await json<{ id: string }>('academy', 'question', 'set', quiz.id, first.id, '--prompt', 'New', '--regenerated');
  assert.notEqual(fresh.id, first.id);
});

test('courses order their quizzes, and a course removed leaves one-offs', async () => {
  const course = await json<{ id: string; path: string }>('academy', 'course', 'new', 'A course');
  const a = await json<Quiz>('academy', 'quiz', 'new', 'First', '--course', course.id);
  const b = await json<Quiz>('academy', 'quiz', 'new', 'Second', '--course', course.id);
  assert.equal(a.rank, 1);
  assert.equal(b.rank, 2);
  await json('academy', 'quiz', 'set', b.id, '--place', '1');
  const shown = await json<{ quizzes: Array<{ id: string; place: number }> }>('academy', 'course', 'show', course.id);
  assert.deepEqual(
    shown.quizzes.map((row) => row.id),
    [b.id, a.id],
  );
  assert.equal(path.dirname(b.path), path.dirname(course.path), 'reordering renames nothing');

  await json('academy', 'course', 'remove', course.id);
  const moved = await json<Quiz>('academy', 'quiz', 'show', a.id);
  assert.equal(moved.course, null);
  assert.equal(moved.id, a.id);
  assert.ok(!existsSync(path.join(sandbox.root, path.dirname(course.path))));
});

test('an official attempt is committed, a practice attempt stays local, and copies survive a regenerate', async () => {
  const quiz = await json<Quiz>('academy', 'quiz', 'new', 'Attempts', '--created-by', 'bo', '--open');
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
  const folder = path.join(sandbox.root, '.eidos/plugins/academy/results', official.attempt.by);
  assert.equal(readdirSync(folder).filter((name) => name.endsWith('.yaml')).length, 1);

  const practice = await sandbox.route<{ attempt: { id: string; by: string } }>('POST', 'attempt', {
    body: { quiz: quiz.id, kind: 'practice', mode: 'missed', answers: [{ question: two.id, chosen: 0 }] },
  });
  assert.ok(existsSync(path.join(sandbox.root, '.eidos/plugins/academy/local/results', practice.attempt.by, `${practice.attempt.id}.yaml`)));
  assert.equal(readdirSync(folder).filter((name) => name.endsWith('.yaml')).length, 1, 'practice is never with the committed results');

  await json('academy', 'question', 'set', quiz.id, one.id, '--prompt', 'Replaced', '--regenerated');
  const again = await sandbox.route<{ answers: Array<{ question: { prompt: string } }> }>('GET', 'attempt', { query: { id: quiz.id, attempt: official.attempt.id } });
  assert.equal(again.answers[0]!.question.prompt, 'One', 'an attempt keeps the question as it was asked');

  const whole = await sandbox.route('POST', 'attempt', { body: { quiz: quiz.id, kind: 'official', mode: 'missed', answers: [{ question: two.id, chosen: 0 }] } }).catch((cause: Error) => cause);
  assert.match(String((whole as Error).message), /whole quiz/);
});

test('results are shown to the creator, proctors, and owners, and totals to everyone', async () => {
  const quiz = await json<Quiz>('academy', 'quiz', 'new', 'Shown', '--created-by', 'bo');
  await question(quiz.id, 'One');
  const asAda = await sandbox.run(['academy', 'quiz', 'results', quiz.id, '--json'], { env: { EIDOS_USER: 'ada' } });
  assert.equal(JSON.parse(asAda.stdout).everyone, undefined);
  const asBo = await sandbox.run(['academy', 'quiz', 'results', quiz.id, '--json'], { env: { EIDOS_USER: 'bo' } });
  assert.deepEqual(JSON.parse(asBo.stdout).everyone, []);
  const asOwner = await sandbox.run(['academy', 'quiz', 'results', quiz.id, '--json'], { env: { EIDOS_USER: 'own' } });
  assert.deepEqual(JSON.parse(asOwner.stdout).everyone, []);

  await sandbox.run(['academy', 'quiz', 'set', quiz.id, '--add-proctor', 'ada'], { env: { EIDOS_USER: 'bo' } });
  const proctor = await sandbox.run(['academy', 'quiz', 'results', quiz.id, '--json'], { env: { EIDOS_USER: 'ada' } });
  assert.deepEqual(JSON.parse(proctor.stdout).everyone, []);

  const refused = await sandbox.run(['academy', 'quiz', 'set', quiz.id, '--add-proctor', 'nobody'], { env: { EIDOS_USER: 'bo' } });
  assert.match(refused.stderr, /not in the project's users/);
});

test('with no owner marked, or no user selected, everyone sees results and practice still saves', async () => {
  const quiz = await json<Quiz>('academy', 'quiz', 'new', 'Open to all', '--created-by', 'bo');
  const one = await question(quiz.id, 'One');
  const file = path.join(sandbox.root, SETTINGS);
  const held = readFileSync(file, 'utf8');
  const local = path.join(sandbox.root, '.eidos/plugins/eidosmd/local.yaml');
  const localHeld = readFileSync(local, 'utf8');
  try {
    const settings = parse(held) as { users: Array<Record<string, unknown>> };
    settings.users = settings.users.map(({ owner: _owner, ...user }) => user);
    writeFileSync(file, stringify(settings));
    const asAda = await sandbox.run(['academy', 'quiz', 'results', quiz.id, '--json'], { env: { EIDOS_USER: 'ada' } });
    assert.deepEqual(JSON.parse(asAda.stdout).everyone, [], 'no owner marked: ada sees results');

    writeFileSync(file, held);
    const { user: _user, ...unset } = parse(localHeld) as Record<string, unknown>;
    writeFileSync(local, stringify(unset));
    const asNobody = await sandbox.run(['academy', 'quiz', 'results', quiz.id, '--json'], { env: { EIDOS_USER: 'nobody-listed' } });
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

test('a quiz opens with its first question, and one a person closes stays closed', async () => {
  const quiz = await json<Quiz & { status: string }>('academy', 'quiz', 'new', 'Not ready', '--created-by', 'bo');
  assert.equal(quiz.status, 'closed', 'no question to ask yet');
  const empty = await sandbox.run(['academy', 'quiz', 'set', quiz.id, '--status', 'open'], { env: { EIDOS_USER: 'bo' } });
  assert.match(empty.stderr, /add a question/);

  const one = await question(quiz.id, 'One');
  const opened = await json<Quiz & { status: string }>('academy', 'quiz', 'show', quiz.id);
  assert.equal(opened.status, 'open', 'its first question opens it');
  assert.doesNotMatch(readFileSync(path.join(sandbox.root, quiz.path), 'utf8'), /status:/);

  // the page acts as ada, who neither created it nor proctors it
  const body = (kind: string) => ({ quiz: quiz.id, kind, mode: 'whole', answers: [{ question: one.id, chosen: 0 }] });
  await sandbox.route('POST', 'attempt', { body: body('official') });

  await json('academy', 'quiz', 'set', quiz.id, '--status', 'closed');
  await question(quiz.id, 'Two');
  const held = await json<Quiz & { status: string }>('academy', 'quiz', 'show', quiz.id);
  assert.equal(held.status, 'closed', 'another question does not undo a person closing it');
  assert.match(readFileSync(path.join(sandbox.root, quiz.path), 'utf8'), /status: closed/);
  await assert.rejects(sandbox.route('POST', 'attempt', { body: body('official') }), /closed/);
  await assert.rejects(sandbox.route('POST', 'attempt', { body: body('practice') }), /closed/);

  await json('academy', 'quiz', 'set', quiz.id, '--add-proctor', 'ada');
  await assert.rejects(sandbox.route('POST', 'attempt', { body: body('official') }), /closed/);

  await json('academy', 'quiz', 'set', quiz.id, '--status', 'open');
  assert.equal((await json<{ status: string }>('academy', 'quiz', 'show', quiz.id)).status, 'open');
});

test('a quiz written with --closed stays closed through its questions until it is opened', async () => {
  const quiz = await json<Quiz>('academy', 'quiz', 'new', 'Being written', '--closed');
  await question(quiz.id, 'One');
  assert.equal((await json<{ status: string }>('academy', 'quiz', 'show', quiz.id)).status, 'closed');
  await json('academy', 'quiz', 'set', quiz.id, '--status', 'open');
  assert.equal((await json<{ status: string }>('academy', 'quiz', 'show', quiz.id)).status, 'open');
});

test('enrolling follows a person across a course, and the people who run it see them', async () => {
  const as = async <T>(user: string, ...args: string[]): Promise<T> => {
    const run = await sandbox.run([...args, '--json'], { env: { EIDOS_USER: user } });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout) as T;
  };
  const refused = async (user: string, pattern: RegExp, ...args: string[]): Promise<void> => {
    const run = await sandbox.run(args, { env: { EIDOS_USER: user } });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, pattern);
  };
  const course = await as<{ id: string }>('bo', 'academy', 'course', 'new', 'Followed');
  const first = await as<Quiz>('bo', 'academy', 'quiz', 'new', 'First', '--course', course.id);
  await as<Quiz>('bo', 'academy', 'quiz', 'new', 'Second', '--course', course.id);
  const one = await question(first.id, 'One');

  // the page acts as ada; an attempt from before she enrolled counts
  const taken = await sandbox.route<{ attempt: { id: string } }>('POST', 'attempt', { body: { quiz: first.id, kind: 'official', mode: 'whole', answers: [{ question: one.id, chosen: 0 }] } });
  const before = await sandbox.route<{ enrolled_since: string | null; may: { enroll: boolean; people: boolean } }>('GET', 'course', { query: { id: course.id } });
  assert.deepEqual([before.enrolled_since, before.may.enroll, before.may.people], [null, true, false]);
  await assert.rejects(sandbox.route('GET', 'course/progress', { query: { id: course.id } }), /not enrolled/);

  await sandbox.route('POST', 'course/enroll', { query: { id: course.id } });
  const after = await sandbox.route<{ enrolled_since: string | null; enrolled_people: number }>('GET', 'course', { query: { id: course.id } });
  assert.ok(after.enrolled_since);
  assert.equal(after.enrolled_people, 1);
  assert.ok(existsSync(path.join(sandbox.root, '.eidos/plugins/academy/results/ada/enrollments.yaml')));

  interface Progress {
    mine: boolean;
    progress: { taken: number; of: number; average_best: number; quizzes: Array<{ id: string; attempts: number; best: number | null; history: Array<{ id: string }> }> };
  }
  const mine = await sandbox.route<Progress>('GET', 'course/progress', { query: { id: course.id } });
  assert.deepEqual([mine.mine, mine.progress.taken, mine.progress.of, mine.progress.average_best], [true, 1, 2, 1]);
  assert.deepEqual(
    mine.progress.quizzes.map((row) => row.attempts),
    [1, 0],
  );

  // anyone may enroll, the course's creator too
  await as('bo', 'academy', 'course', 'enroll', course.id);
  await refused('agent', /only people enroll/, 'academy', 'course', 'enroll', course.id);

  // the creator sees everyone and each one's scores; someone else sees neither
  const roster = await as<{ people: Array<{ alias: string; taken: number }> }>('bo', 'academy', 'course', 'people', course.id);
  assert.deepEqual(
    roster.people.map((person) => [person.alias, person.taken]),
    [
      ['ada', 1],
      ['bo', 0],
    ],
  );
  const seen = await as<Progress>('bo', 'academy', 'course', 'progress', course.id, '--person', 'ada');
  assert.equal(seen.mine, false);
  assert.equal(seen.progress.quizzes[0]!.history[0]!.id, taken.attempt.id);
  await refused('ada', /who enrolled in a course is shown/, 'academy', 'course', 'people', course.id);
  await refused('ada', /another person's progress is shown/, 'academy', 'course', 'progress', course.id, '--person', 'bo');
  await refused('bo', /@agent is not enrolled/, 'academy', 'course', 'progress', course.id, '--person', 'agent');

  // a proctor of one of its quizzes follows the course too
  await as('bo', 'academy', 'quiz', 'set', first.id, '--add-proctor', 'own');
  const asOwner = await as<{ people: unknown[] }>('own', 'academy', 'course', 'people', course.id);
  assert.equal(asOwner.people.length, 2);

  // leaving keeps the results, and enrolling again brings the progress back
  const attempts = path.join(sandbox.root, '.eidos/plugins/academy/results/ada', `${taken.attempt.id}.yaml`);
  await sandbox.route('DELETE', 'course/enroll', { query: { id: course.id } });
  assert.ok(existsSync(attempts));
  const gone = await as<{ people: Array<{ alias: string }> }>('bo', 'academy', 'course', 'people', course.id);
  assert.deepEqual(
    gone.people.map((person) => person.alias),
    ['bo'],
  );
  await sandbox.route('POST', 'course/enroll', { query: { id: course.id } });
  assert.equal((await sandbox.route<Progress>('GET', 'course/progress', { query: { id: course.id } })).progress.taken, 1);
});

test("someone who follows a course sees an enrolled person's answers, and not those of someone who is not enrolled", async () => {
  const course = await json<{ id: string }>('academy', 'course', 'new', 'Answers', '--created-by', 'ada');
  const quiz = await json<Quiz>('academy', 'quiz', 'new', 'Asked', '--course', course.id, '--created-by', 'bo');
  const one = await question(quiz.id, 'One');
  // the attempt is bo's, while the page keeps acting as ada, who created the course but not the quiz
  const local = path.join(sandbox.root, '.eidos/plugins/eidosmd/local.yaml');
  const held = readFileSync(local, 'utf8');
  let attempt: string;
  try {
    writeFileSync(local, stringify({ ...(parse(held) as object), user: 'bo' }));
    attempt = (await sandbox.route<{ attempt: { id: string } }>('POST', 'attempt', { body: { quiz: quiz.id, kind: 'official', mode: 'whole', answers: [{ question: one.id, chosen: 0 }] } })).attempt
      .id;
  } finally {
    writeFileSync(local, held);
  }
  await assert.rejects(sandbox.route('GET', 'attempt', { query: { id: quiz.id, attempt } }), /shown to the quiz's creator/);
  const run = await sandbox.run(['academy', 'course', 'enroll', course.id], { env: { EIDOS_USER: 'bo' } });
  assert.equal(run.status, 0, run.stderr);
  const seen = await sandbox.route<{ by: string }>('GET', 'attempt', { query: { id: quiz.id, attempt } });
  assert.equal(seen.by, 'bo');
});

test("a course's title, description, and creator change from the page's route, for those who may edit it", async () => {
  const course = await json<{ id: string; path: string }>('academy', 'course', 'new', 'Before', '--created-by', 'ada');
  await sandbox.route('PUT', 'course', { query: { id: course.id }, body: { title: 'After', description: 'Now it says' } });
  const shown = await sandbox.route<{ course: { title: string; description: string }; people: Array<{ alias: string }> }>('GET', 'course', { query: { id: course.id } });
  assert.deepEqual([shown.course.title, shown.course.description], ['After', 'Now it says']);
  assert.ok(shown.people.some((person) => person.alias === 'bo'));
  assert.ok(!shown.people.some((person) => person.alias === 'agent'), 'an agent cannot hold a course');
  const held = await json<{ id: string }>('academy', 'course', 'new', 'Someone else', '--created-by', 'bo');
  await assert.rejects(sandbox.route('PUT', 'course', { query: { id: held.id }, body: { title: 'Taken' } }), /creator/);
});

// ---- decks ----

interface DeckFile {
  id: string;
  path: string;
  course: string | null;
  rank: number;
  status: string;
  made_from: string | null;
  cards: Array<{ id: string; front: string; back: string }>;
}

async function card(deck: string, front: string, back = 'The back'): Promise<{ id: string }> {
  return json('academy', 'card', 'add', deck, '--front', front, '--back', back);
}

test('a deck is written from the shell as a page a person can read, and a card with no back is refused', async () => {
  const deck = await json<DeckFile>('academy', 'deck', 'new', 'Lesson cards', '--draws-from', 'B-NOPE');
  assert.equal(deck.status, 'closed', 'nothing to study yet');
  await card(deck.id, 'What does mishkan mean?', 'Dwelling place');
  const shown = await json<{ deck: DeckFile }>('academy', 'deck', 'show', deck.id);
  assert.equal(shown.deck.cards.length, 1);
  assert.equal(shown.deck.status, 'open', 'open as soon as it has a card');
  const text = readFileSync(path.join(sandbox.root, shown.deck.path), 'utf8');
  assert.match(text, /type: deck/);
  assert.match(text, /\*\*Back:\*\* Dwelling place/);
  assert.match(text, /created_by: ada/);

  const refused = await sandbox.run(['academy', 'card', 'add', deck.id, '--front', 'No back'], { env: { EIDOS_USER: 'ada' } });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /it has no back/);

  const listed = await json<{ quizzes: unknown[]; decks: Array<{ id: string }> }>('academy', 'list');
  assert.ok(
    listed.decks.some((row) => row.id === deck.id),
    'the list holds decks beside quizzes',
  );
  const check = await sandbox.run(['check']);
  assert.match(check.stdout + check.stderr, /this deck draws from B-NOPE, which is gone/);
});

test("a deck made from a quiz takes each question's prompt and answer, and adding the quiz again adds nothing twice", async () => {
  const quiz = await json<Quiz>('academy', 'quiz', 'new', 'Source quiz');
  await question(quiz.id, 'Which is right?');
  await question(quiz.id, 'Which is right now?');
  const deck = await json<DeckFile>('academy', 'deck', 'new', 'From the quiz', '--from-quiz', quiz.id);
  assert.equal(deck.made_from, quiz.id);
  assert.equal(deck.cards.length, 2);
  assert.equal(deck.cards[0]!.front, 'Which is right?');
  assert.equal(deck.cards[0]!.back, 'Right. Because');
  const again = await json<DeckFile>('academy', 'deck', 'set', deck.id, '--add-from-quiz', quiz.id);
  assert.equal(again.cards.length, 2);
});

test('studying a deck keeps each session with the project, and a card is learned after two Got it in a row, with no date to come back', async () => {
  const deck = await json<DeckFile>('academy', 'deck', 'new', 'Study me');
  const one = await card(deck.id, 'One');
  const two = await card(deck.id, 'Two');
  const three = await card(deck.id, 'Three');

  const first = await sandbox.route<{ cards: Array<{ card: { id: string }; state: string }> }>('GET', 'study', { query: { deck: deck.id } });
  assert.deepEqual(
    first.cards.map((held) => held.card.id),
    [one.id, two.id, three.id],
    'never seen: in the deck order',
  );
  const saved = await sandbox.route<{ shared: boolean; cards: number; got: number; still_learning: number; decks: Array<{ learned: number; gained: number }> }>('POST', 'study', {
    body: {
      mode: 'next',
      started_at: new Date(Date.now() - 120_000).toISOString(),
      answers: [
        { deck: deck.id, card: one.id, got: true },
        { deck: deck.id, card: two.id, got: false },
        { deck: deck.id, card: two.id, got: true },
      ],
    },
  });
  assert.equal(saved.shared, true);
  assert.deepEqual([saved.cards, saved.got, saved.still_learning], [2, 2, 0], 'a card missed then got in one sitting counts its last answer');
  const folder = path.join(sandbox.root, '.eidos/plugins/academy/results/ada/reviews');
  assert.equal(readdirSync(folder).length, 1, 'one committed file a session');

  const next = await sandbox.route<{ cards: Array<{ card: { id: string }; state: string }> }>('GET', 'study', { query: { deck: deck.id } });
  assert.deepEqual(
    next.cards.map((held) => [held.card.id, held.state]),
    [
      [one.id, 'learning'],
      [two.id, 'learning'],
      [three.id, 'new'],
    ],
    'still learning first, then the card never seen',
  );

  await sandbox.route('POST', 'study', {
    body: {
      mode: 'next',
      started_at: new Date().toISOString(),
      answers: [
        { deck: deck.id, card: one.id, got: true },
        { deck: deck.id, card: three.id, got: false },
      ],
    },
  });
  const view = await sandbox.route<{
    progress: { learned: number; learning: number; new: number; last_studied: string | null; history: unknown[] };
    missed_last: number;
    standings: Record<string, { state: string; last_seen: string | null }>;
  }>('GET', 'deck', {
    query: { id: deck.id },
  });
  assert.deepEqual([view.progress.learned, view.progress.learning, view.progress.new], [1, 2, 0]);
  assert.equal(view.progress.history.length, 2);
  assert.ok(view.progress.last_studied, 'when they studied is kept');
  assert.ok(view.standings[one.id]!.last_seen);
  assert.equal(view.missed_last, 1);
  const missed = await sandbox.route<{ cards: Array<{ card: { id: string } }> }>('GET', 'study', { query: { deck: deck.id, mode: 'missed' } });
  assert.deepEqual(
    missed.cards.map((held) => held.card.id),
    [three.id],
  );
  const text = readdirSync(folder)
    .map((name) => readFileSync(path.join(folder, name), 'utf8'))
    .join('\n');
  assert.doesNotMatch(text, /due|next_review|interval/, 'a session records what happened, never when to come back');
});

test('only people study: an agent has no study sessions', async () => {
  const deck = await json<DeckFile>('academy', 'deck', 'new', 'Agents');
  const one = await card(deck.id, 'One');
  const local = path.join(sandbox.root, '.eidos/plugins/eidosmd/local.yaml');
  const held = readFileSync(local, 'utf8');
  try {
    writeFileSync(local, stringify({ ...(parse(held) as object), user: 'agent' }));
    await assert.rejects(sandbox.route('POST', 'study', { body: { mode: 'next', started_at: new Date().toISOString(), answers: [{ deck: deck.id, card: one.id, got: true }] } }), /only people study/);
  } finally {
    writeFileSync(local, held);
  }
});

test('a course holds quizzes and decks in one order, and Keep studying lists every deck with where the person stands', async () => {
  const course = await json<{ id: string }>('academy', 'course', 'new', 'Mixed course');
  const quiz = await json<Quiz>('academy', 'quiz', 'new', 'Mixed quiz', '--course', course.id);
  const deck = await json<DeckFile>('academy', 'deck', 'new', 'Mixed deck', '--course', course.id);
  assert.equal(deck.rank, 2, 'a deck takes the next place after the quiz');
  await json('academy', 'deck', 'set', deck.id, '--place', '1');
  const shown = await json<{ items: Array<{ kind: string; row: { id: string; place: number } }> }>('academy', 'course', 'show', course.id);
  assert.deepEqual(
    shown.items.map((placed) => [placed.kind, placed.row.id, placed.row.place]),
    [
      ['deck', deck.id, 1],
      ['quiz', quiz.id, 2],
    ],
  );
  await card(deck.id, 'In a course');
  const keep = await sandbox.route<{ decks: Array<{ id: string; unseen: number }> }>('GET', 'keep-studying');
  assert.equal(keep.decks.find((row) => row.id === deck.id)?.unseen, 1);
  const across = await sandbox.route<{ cards: Array<{ deck: string }> }>('GET', 'study', { query: { course: course.id } });
  assert.deepEqual(
    across.cards.map((held) => held.deck),
    [deck.id],
  );

  await json('academy', 'course', 'remove', course.id);
  const moved = await json<{ deck: DeckFile }>('academy', 'deck', 'show', deck.id);
  assert.equal(moved.deck.course, null, 'a course removed leaves its decks as one-offs');
});

test('move-quizzes brings what the Quizzes plugin left into Academy, keeping every id and result', async () => {
  const declared = await sandbox.run(['configure:folder', 'add', 'old-quizzes', '--owned-by', '@quizzes/quizzes', '--yes'], { env: { EIDOS_USER: 'own' } });
  assert.equal(declared.status, 0, declared.stderr);
  const old = path.join(sandbox.root, 'old-quizzes');
  writeFileSync(path.join(old, 'legacy.md'), '---\nid: Q-OLD1\ntitle: Legacy quiz\n---\n\n## q-one\n\nAsked?\n\n- [x] Yes\n- [ ] No\n');
  const results = path.join(sandbox.root, '.eidos/plugins/quizzes/results/bo');
  mkdirSync(results, { recursive: true });
  writeFileSync(
    path.join(results, 'a-old.yaml'),
    stringify({ id: 'a-old', quiz: 'Q-OLD1', quiz_title: 'Legacy quiz', kind: 'official', mode: 'whole', by: 'bo', completed_at: '2026-11-01T00:00:00Z', score: 1, total: 1, answers: [] }),
  );

  const check = await sandbox.run(['check']);
  assert.match(check.stdout + check.stderr, /eidos academy move-quizzes brings them into Academy/);
  const dry = await json<{ dry_run: boolean }>('academy', 'move-quizzes', '--dry-run');
  assert.equal(dry.dry_run, true);
  assert.ok(existsSync(path.join(old, 'legacy.md')), 'a dry run moves nothing');

  const run = await sandbox.run(['academy', 'move-quizzes', '--json'], { env: { EIDOS_USER: 'own' } });
  assert.equal(run.status, 0, run.stderr);
  const moved = JSON.parse(run.stdout) as { quizzes: number; results: number; folder: string; then: string[] };
  assert.deepEqual([moved.quizzes, moved.results, moved.folder], [1, 1, 'old-quizzes']);
  assert.ok(moved.then.some((line) => line.startsWith('eidos configure:folder remove old-quizzes')));
  const quiz = await json<Quiz>('academy', 'quiz', 'show', 'Q-OLD1');
  assert.match(quiz.path, /^academy\//);
  assert.ok(existsSync(path.join(sandbox.root, '.eidos/plugins/academy/results/bo/a-old.yaml')));
  assert.ok(!existsSync(old), 'the emptied folder goes, so the check reports no folder nobody declares');
  assert.ok(!existsSync(path.join(sandbox.root, '.eidos/plugins/quizzes')), "Quizzes' emptied workspace goes too");
  const after = await json<{ quizzes_left: unknown }>('academy', 'list');
  assert.equal(after.quizzes_left, null);
});

test('every question type is written from the shell, and a written answer waits for a grade the agent can suggest', async () => {
  const as = async <T>(user: string, ...args: string[]): Promise<{ status: number; stderr: string; value: T | null }> => {
    const run = await sandbox.run([...args, '--json'], { env: { EIDOS_USER: user } });
    return { status: run.status ?? 1, stderr: run.stderr, value: run.status === 0 ? (JSON.parse(run.stdout) as T) : null };
  };
  const quiz = await json<Quiz>('academy', 'quiz', 'new', 'Every type', '--closed');
  const add = (...args: string[]) => json<{ id: string; type: string; points: number }>('academy', 'question', 'add', quiz.id, ...args);
  const tf = await add('--type', 'true-or-false', '--prompt', 'It was a meeting tent.', '--answer', 'False', '--why', 'It was a dwelling.');
  const all = await add('--type', 'check-all', '--prompt', 'Which are true?', '--option', 'A', '--option', 'B', '--option', 'C', '--answer', '1', '--answer', '3', '--why', 'A and C.');
  const short = await add('--type', 'short-answer', '--prompt', 'Which mountain?', '--accept', 'Sinai', '--accept', 'Mount Sinai', '--why', 'Exodus 25.', '--context', 'Exodus 25 to 31.');
  const order = await add('--type', 'put-in-order', '--prompt', 'In order', '--item', 'Genesis', '--item', 'Exodus', '--why', 'Moses.');
  const match = await add('--type', 'match', '--prompt', 'Match', '--pair', 'mishkan -> Dwelling place', '--pair', 'mikdash -> Holy place', '--why', 'Names.');
  const written = await add('--type', 'written-answer', '--prompt', 'Explain it', '--model', 'Near and holy.', '--covers', 'Nearness; holiness', '--points', '5');
  assert.equal(written.points, 5);
  assert.equal(tf.type, 'truefalse');
  await json('academy', 'quiz', 'set', quiz.id, '--status', 'open', '--shuffle-options', 'off');
  const text = readFileSync(path.join(sandbox.root, quiz.path), 'utf8');
  assert.match(text, /\*\*Type:\*\* put in order/);
  assert.match(text, /- mishkan → Dwelling place/);
  assert.match(text, /\*\*Model answer:\*\* Near and holy\./);
  assert.match(text, /shuffle_options: false/);

  const answers = [
    { question: tf.id, response: 1 },
    { question: all.id, response: [0, 2] },
    { question: short.id, response: 'mount sinai' },
    { question: order.id, response: ['Genesis', 'Exodus'] },
    { question: match.id, response: ['Dwelling place', 'Holy place'] },
    { question: written.id, response: 'God is near, and holy.' },
  ];
  const taken = await sandbox.route<{ attempt: { id: string; score: number; total: number }; waiting: number }>('POST', 'attempt', {
    body: { quiz: quiz.id, kind: 'official', mode: 'whole', answers },
  });
  assert.equal(taken.waiting, 1);
  assert.equal(taken.attempt.score, 5);
  assert.equal(taken.attempt.total, 10);

  // bo neither created it nor proctors it, so does not grade it; the owner does
  assert.match((await as('bo', 'academy', 'grade', 'list', quiz.id)).stderr, /graded by its creator/);
  const listed = await as<{ waiting: Array<{ attempt: string; question: { id: string } }> }>('own', 'academy', 'grade', 'list', quiz.id);
  assert.equal(listed.value!.waiting.length, 1);

  // an agent grades for the person who asked it, as a suggestion
  const refused = await as('agent', 'academy', 'grade', 'add', quiz.id, taken.attempt.id, written.id, '--points', '4');
  assert.match(refused.stderr, /--for/);
  const suggested = await as<{ ai: boolean; by: string; suggestion: boolean }>(
    'agent',
    'academy',
    'grade',
    'add',
    quiz.id,
    taken.attempt.id,
    written.id,
    '--points',
    '4',
    '--note',
    'Close.',
    '--suggestion',
    '--for',
    'own',
  );
  assert.equal(suggested.value!.by, 'own');
  assert.equal(suggested.value!.ai, true);
  const still = await as<{ waiting: unknown[] }>('own', 'academy', 'grade', 'list', quiz.id);
  assert.equal(still.value!.waiting.length, 1, 'a suggestion does not count');

  const tooMany = await as('own', 'academy', 'grade', 'add', quiz.id, taken.attempt.id, written.id, '--points', '6');
  assert.match(tooMany.stderr, /0 to 5/);
  await as('own', 'academy', 'grade', 'add', quiz.id, taken.attempt.id, written.id, '--points', '3', '--note', 'Name both.');
  const done = await as<{ waiting: unknown[]; graded: Array<{ earned: number; grade: { by: string } }> }>('own', 'academy', 'grade', 'list', quiz.id);
  assert.equal(done.value!.waiting.length, 0);
  assert.equal(done.value!.graded[0]!.earned, 3);
  assert.ok(existsSync(path.join(sandbox.root, '.eidos/plugins/academy/results/own/grades')), "a grade is kept in the grader's own folder");
  const mine = await sandbox.route<{ attempt: { score: number; waiting: number } }>('GET', 'attempt', { query: { id: quiz.id, attempt: taken.attempt.id } }).catch(() => null);
  if (mine) assert.equal((mine as unknown as { score: number }).score, 8);
});
