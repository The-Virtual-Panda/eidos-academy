// The pure work: a quiz's and a deck's file read back as they were written, and every sum a page shows.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accessOf,
  canEdit,
  canManage,
  canSeeCourse,
  canSeeResults,
  cardsAcross,
  cardsFromQuiz,
  cardsToStudy,
  compare,
  deckProgress,
  isDeckSource,
  makeReview,
  parseDeck,
  renderDeck,
  standings,
  courseProgress,
  everyone,
  makeAttempt,
  myScores,
  parseQuestions,
  parseQuiz,
  practiceSets,
  renderQuiz,
  statusOf,
  type Attempt,
  type Deck,
  type Quiz,
  type Review,
} from '../src/model.ts';

const quiz: Quiz = {
  id: 'Q-AAAA',
  title: 'A quiz',
  draws_from: ['B-1', 'https://example.com'],
  created_by: 'ada',
  proctors: ['bo'],
  status: 'closed',
  closed: true,
  rank: 2,
  course: null,
  path: 'academy/a-quiz.md',
  questions: [
    { id: 'q-one', prompt: 'First line\n\nSecond paragraph', options: ['Right', 'Wrong'], answer: 0, why: 'Because', reference: 'Page 1' },
    { id: 'q-two', prompt: 'Two', options: ['Wrong', 'Wrong too', 'Right'], answer: 2, why: '', reference: '' },
  ],
};

function attempt(by: string, score: number, total: number, at: string, kind: Attempt['kind'] = 'official'): Attempt {
  return { id: `${by}-${at}`, quiz: 'Q-AAAA', quiz_title: 'A quiz', kind, mode: 'whole', by, completed_at: at, score, total, answers: [] };
}

test("a quiz's file reads back as it was written", () => {
  const read = parseQuiz(renderQuiz(quiz), quiz.path, null);
  assert.deepEqual(read, quiz);
});

test('a quiz is open once it has a question to ask, unless a person closed it', () => {
  const question = quiz.questions[0]!;
  assert.equal(statusOf({ closed: false, questions: [] }), 'closed', 'nothing to ask');
  assert.equal(statusOf({ closed: false, questions: [{ ...question, answer: null }] }), 'closed', 'a question with no answer cannot be asked');
  assert.equal(statusOf({ closed: false, questions: [question] }), 'open');
  assert.equal(statusOf({ closed: true, questions: [question] }), 'closed');
});

test('the file says closed only when a person closed it, and an older status: open still reads', () => {
  const open = { ...quiz, closed: false, status: 'open' as const };
  assert.ok(!renderQuiz(open).includes('status:'));
  assert.equal(parseQuiz(renderQuiz(open), quiz.path, null).status, 'open');
  const older = renderQuiz(open).replace('id: Q-AAAA', 'id: Q-AAAA\nstatus: open');
  assert.deepEqual([parseQuiz(older, quiz.path, null).status, parseQuiz(older, quiz.path, null).closed], ['open', false]);
  assert.match(renderQuiz(quiz), /status: closed/);
});

test('a question with nothing marked reads as having no answer', () => {
  const [question] = parseQuestions('## q-a\n\nPrompt\n\n- [ ] One\n- [ ] Two\n');
  assert.equal(question!.answer, null);
  assert.equal(question!.prompt, 'Prompt');
});

test('an attempt scores against the quiz and keeps a copy of each question', () => {
  const made = makeAttempt({
    id: 'a',
    quiz,
    kind: 'official',
    mode: 'whole',
    by: 'ada',
    completedAt: '2026-11-06',
    answers: [
      { question: 'q-one', chosen: 0 },
      { question: 'q-two', chosen: 0 },
    ],
  });
  assert.equal(made.score, 1);
  assert.equal(made.answers[1]!.question.prompt, 'Two');
  assert.throws(() => makeAttempt({ id: 'b', quiz, kind: 'official', mode: 'whole', by: 'ada', completedAt: 'x', answers: [{ question: 'q-one', chosen: 0 }] }), /whole quiz/);
  assert.throws(() => makeAttempt({ id: 'c', quiz, kind: 'practice', mode: 'whole', by: 'ada', completedAt: 'x', answers: [{ question: 'q-gone', chosen: 0 }] }), /no question/);
});

test('the latest answer decides what is missed, and a question never answered is unseen', () => {
  const answered = (question: string, chosen: number, at: string): Attempt => ({
    ...attempt('ada', 0, 1, at, 'practice'),
    answers: [{ question: { id: question, prompt: '', options: ['a', 'b'], answer: 0, why: '', reference: '' }, chosen }],
  });
  assert.deepEqual(practiceSets(quiz, [answered('q-one', 1, '1'), answered('q-one', 0, '2')]), { missed: [], unseen: ['q-two'] });
  assert.deepEqual(practiceSets(quiz, [answered('q-one', 0, '1'), answered('q-one', 1, '2')]), { missed: ['q-one'], unseen: ['q-two'] });
});

test('my scores count official attempts, and the history holds both kinds', () => {
  const scores = myScores([attempt('ada', 14, 20, '1'), attempt('ada', 18, 20, '2'), attempt('ada', 17, 20, '3'), attempt('ada', 20, 20, '4', 'practice')]);
  assert.equal(scores.best?.score, 18);
  assert.equal(scores.latest?.score, 17);
  assert.ok(Math.abs(scores.latest!.change! + 0.05) < 1e-9);
  assert.equal(scores.official_attempts, 3);
  assert.equal(scores.over_time.length, 3);
  assert.equal(scores.history.length, 4);
  assert.equal(scores.history[0]!.kind, 'practice');
});

test('totals count each person once, by their latest, and carry no one else', () => {
  const totals = compare([attempt('ada', 5, 10, '1'), attempt('ada', 8, 10, '2'), attempt('bo', 6, 10, '1')], 'ada');
  assert.equal(totals.people, 2);
  assert.ok(Math.abs(totals.average! - 0.7) < 1e-9);
  assert.equal(totals.mine, 0.8);
  assert.deepEqual(
    totals.bands.map((band) => band.count),
    [0, 1, 0, 1, 0],
  );
  assert.equal(totals.bands.find((band) => band.mine)?.label, '80s');
  assert.ok(!JSON.stringify(totals).includes('bo'));
});

test('everyone lists each person with their attempts, newest taken first', () => {
  const people = everyone([attempt('ada', 5, 10, '1'), attempt('ada', 8, 10, '3'), attempt('bo', 6, 10, '2')]);
  assert.deepEqual(
    people.map((person) => person.alias),
    ['ada', 'bo'],
  );
  assert.equal(people[0]!.attempts, 2);
  assert.equal(people[0]!.latest, 0.8);
  assert.equal(people[0]!.best, 0.8);
});

test("a person's progress lists every quiz of the course in order, with only their own official scores", () => {
  const quizzes = [
    { id: 'Q-1', title: 'One', status: 'open' as const },
    { id: 'Q-2', title: 'Two', status: 'closed' as const },
    { id: 'Q-3', title: 'Three', status: 'open' as const },
  ];
  const on = (quiz: string, by: string, score: number, at: string): Attempt => ({ ...attempt(by, score, 10, at), quiz, id: `${quiz}-${by}-${at}` });
  const progress = courseProgress(
    quizzes,
    [on('Q-1', 'ada', 5, '2026-01-01'), on('Q-1', 'ada', 8, '2026-01-03'), on('Q-1', 'ada', 7, '2026-01-04'), on('Q-3', 'ada', 6, '2026-01-02'), on('Q-2', 'bo', 10, '2026-01-09')],
    'ada',
  );
  assert.deepEqual([progress.taken, progress.of], [2, 3]);
  assert.ok(Math.abs(progress.average_best! - 0.7) < 1e-9, 'the average of each quiz taken at its best');
  assert.equal(progress.last_taken, '2026-01-04');
  assert.deepEqual(
    progress.quizzes.map((row) => [row.place, row.id, row.attempts, row.latest, row.best]),
    [
      [1, 'Q-1', 3, 0.7, 0.8],
      [2, 'Q-2', 0, null, null],
      [3, 'Q-3', 1, 0.6, 0.6],
    ],
  );
  assert.equal(progress.quizzes[0]!.history[0]!.completed_at, '2026-01-04', 'newest first');
  const none = courseProgress(quizzes, [], 'cy');
  assert.deepEqual([none.taken, none.average_best, none.last_taken], [0, null, null]);
});

test("a course's people go to its creator, its quizzes' creators and proctors, and owners", () => {
  const course = { created_by: 'ada' };
  const quizzes = [
    { created_by: 'bo', proctors: ['cy'] },
    { created_by: null, proctors: [] },
  ];
  assert.ok(canSeeCourse(course, quizzes, { alias: 'ada', owner: false }));
  assert.ok(canSeeCourse(course, quizzes, { alias: 'bo', owner: false }));
  assert.ok(canSeeCourse(course, quizzes, { alias: 'cy', owner: false }));
  assert.ok(canSeeCourse(course, quizzes, { alias: 'own', owner: true }));
  assert.ok(!canSeeCourse(course, quizzes, { alias: 'di', owner: false }), 'a quiz with no creator opens that quiz, not the course');
  assert.ok(!canSeeCourse(course, quizzes, null));
  assert.ok(canSeeCourse({ created_by: null }, [], { alias: 'di', owner: false }), "a course with no creator is anyone's");
});

test('no user selected, or no owner marked, is full access', () => {
  const held = { created_by: 'ada', proctors: [] };
  const none = accessOf(null, true);
  assert.ok(canSeeResults(held, none));
  assert.ok(canEdit(held, none));
  const noOwners = accessOf({ alias: 'cy', owner: false }, false);
  assert.ok(canSeeResults(held, noOwners));
  assert.ok(canEdit(held, noOwners));
  const withOwners = accessOf({ alias: 'cy', owner: false }, true);
  assert.ok(!canSeeResults(held, withOwners));
  assert.ok(!canEdit(held, withOwners));
});

test("a quiz or a course with no known creator is anyone's to manage", () => {
  const held = { created_by: null, proctors: [] };
  const person = { alias: 'cy', owner: false };
  assert.ok(canSeeResults(held, person));
  assert.ok(canEdit(held, person));
  assert.ok(canEdit({ created_by: null }, person));
});

test('results go to the creator, proctors, and owners; editing to them too, and who holds it to the creator and owners', () => {
  const held = { created_by: 'ada', proctors: ['bo'] };
  assert.ok(canSeeResults(held, { alias: 'ada', owner: false }));
  assert.ok(canSeeResults(held, { alias: 'bo', owner: false }));
  assert.ok(canSeeResults(held, { alias: 'own', owner: true }));
  assert.ok(!canSeeResults(held, { alias: 'cy', owner: false }));
  assert.ok(!canSeeResults(held, null));
  assert.ok(canEdit(held, { alias: 'ada', owner: false }));
  assert.ok(canEdit(held, { alias: 'own', owner: true }));
  assert.ok(canEdit(held, { alias: 'bo', owner: false }), 'a proctor edits the quiz');
  assert.ok(!canManage(held, { alias: 'bo', owner: false }), 'a proctor does not change who holds it');
  assert.ok(canManage(held, { alias: 'ada', owner: false }));
  assert.ok(!canEdit(held, { alias: 'cy', owner: false }));
});

// ---- decks ----

const deck: Deck = {
  id: 'F-AAAA',
  title: 'A deck',
  draws_from: ['B-1'],
  made_from: 'Q-AAAA',
  created_by: 'ada',
  proctors: [],
  status: 'open',
  closed: false,
  rank: 1,
  course: null,
  per_session: 3,
  path: 'academy/a-deck.md',
  cards: [
    { id: 'c-one', front: 'One\n\nwith a second line', back: 'The first\nback', reference: 'Page 1' },
    { id: 'c-two', front: 'Two', back: 'The second', reference: '' },
    { id: 'c-three', front: 'Three', back: 'The third', reference: '' },
    { id: 'c-four', front: 'Four', back: 'The fourth', reference: '' },
  ],
};

let clock = 0;
function sitting(answers: Array<[string, boolean]>, mode: Review['mode'] = 'next'): Review {
  clock += 1;
  const at = new Date(Date.UTC(2026, 10, clock)).toISOString();
  return makeReview({ id: `r-${clock}`, deck, by: 'ada', mode, startedAt: at, completedAt: at, answers: answers.map(([card, got]) => ({ card, got, at })) });
}

test("a deck's file reads back as it was written, and is told apart from a quiz's", () => {
  const text = renderDeck(deck);
  assert.ok(isDeckSource(text));
  assert.ok(!isDeckSource(renderQuiz(quiz)));
  assert.deepEqual(parseDeck(text, deck.path, null), deck);
  assert.match(text, /^type: deck$/m);
  assert.match(text, /^per_session: 3$/m);
  assert.doesNotMatch(renderDeck({ ...deck, per_session: 20 }), /per_session/, 'the default is left out of the file');
});

test('a card is learned after two Got it in a row, and one missed goes back to learning', () => {
  const reviews = [sitting([['c-one', true], ['c-two', false], ['c-three', true]]), sitting([['c-one', true], ['c-two', true], ['c-three', false]])];
  const held = standings(deck, reviews);
  assert.deepEqual(
    ['c-one', 'c-two', 'c-three', 'c-four'].map((id) => held.get(id)!.state),
    ['learned', 'learning', 'learning', 'new'],
  );
  assert.equal(held.get('c-three')!.last_got, false);
  assert.equal(held.get('c-four')!.last_seen, null);
  const progress = deckProgress(deck, reviews);
  assert.deepEqual([progress.learned, progress.learning, progress.new, progress.of], [1, 2, 1, 4]);
  assert.deepEqual(
    progress.history.map((row) => [row.cards, row.still_learning, row.learned_after]),
    [
      [3, 1, 1],
      [3, 1, 0],
    ],
    'newest first, with the learned count each session left',
  );
});

test('a session takes the cards still being learned, then the unseen, then the learned studied longest ago, never by a date to come back', () => {
  const reviews = [sitting([['c-one', true], ['c-one', true], ['c-two', true], ['c-two', true]]), sitting([['c-three', false]]), sitting([['c-two', true]])];
  assert.deepEqual(cardsToStudy(deck, reviews, 'next'), ['c-three', 'c-four', 'c-one'], 'learning, then unseen, then the learned card seen longest ago, three a session');
  assert.deepEqual(cardsToStudy(deck, reviews, 'next', 10), ['c-three', 'c-four', 'c-one', 'c-two']);
  assert.deepEqual(cardsToStudy(deck, [sitting([['c-one', false], ['c-two', true]])], 'missed'), ['c-one'], 'missed: the latest sitting decides');
  assert.deepEqual(cardsToStudy(deck, [], 'whole'), ['c-one', 'c-two', 'c-three', 'c-four']);
});

test('studying across decks takes the cards still being learned from every deck first, the decks taking turns', () => {
  const other: Deck = { ...deck, id: 'F-BBBB', cards: [{ id: 'c-x', front: 'X', back: 'x', reference: '' }] };
  const picked = cardsAcross(
    [
      { deck, reviews: [sitting([['c-one', false]])] },
      { deck: other, reviews: [] },
    ],
    4,
  );
  assert.deepEqual(
    picked.map((held) => `${held.deck}/${held.card}`),
    ['F-AAAA/c-one', 'F-AAAA/c-two', 'F-BBBB/c-x', 'F-AAAA/c-three'],
  );
});

test("a quiz's questions become cards: the prompt on the front, the answer and why on the back", () => {
  let next = 0;
  const cards = cardsFromQuiz(quiz, () => `c-${(next += 1)}`);
  assert.deepEqual(cards[0], { id: 'c-1', front: 'First line\n\nSecond paragraph', back: 'Right. Because', reference: 'Page 1' });
  assert.equal(cards[1]!.back, 'Right');
});

test('a study session keeps a copy of each card, and refuses a card the deck does not have', () => {
  const review = sitting([['c-two', true]]);
  assert.deepEqual(review.answers[0]!.card, deck.cards[1]);
  assert.throws(() => makeReview({ id: 'r', deck, by: 'ada', mode: 'next', startedAt: '', completedAt: '', answers: [{ card: 'c-gone', got: true }] }), /no card c-gone/);
  assert.throws(() => makeReview({ id: 'r', deck, by: 'ada', mode: 'next', startedAt: '', completedAt: '', answers: [] }), /at least one card/);
});
