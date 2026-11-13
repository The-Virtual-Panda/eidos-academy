// A quiz from a public link (Academy REQ68 to REQ75): the guest copy holds no answer, the key holds every answer as Eidos
// compares it, and a guest's submission reads back as an attempt that grades and totals as a member's does.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyGrades, type Grade, type Quiz } from '../src/model.ts';
import { blankQuestion, type Question } from '../src/question.ts';
import { guestAttempt, guestAttemptId, guestCopy, guestReference, shareKey } from '../src/share.ts';

const q = (id: string, patch: Partial<Question>): Question => ({ ...blankQuestion(id, patch.type ?? 'choice'), prompt: `Question ${id}`, ...patch });

const every: Question[] = [
  q('q-choice', { options: ['Wrong', 'Right', 'Wrong too'], answer: 1, correct: [1], why: 'Because B.', reference: 'B-K41#The tabernacle' }),
  q('q-tf', { type: 'truefalse', options: ['True', 'False'], answer: 1, correct: [1], why: 'It was where God lived.' }),
  q('q-all', { type: 'all', options: ['A', 'B', 'C'], correct: [0, 2], answer: 0, why: 'A and C.', points: 2 }),
  q('q-short', { type: 'short', accepted: ['Sinai', 'Mount Sinai'], why: 'Exodus 25.', image: 'assets/map.png', reference: 'https://example.com/sinai' }),
  q('q-order', { type: 'order', items: ['Genesis', 'Exodus', 'Leviticus', 'Numbers'], why: 'The books of Moses.' }),
  q('q-match', {
    type: 'match',
    pairs: [
      { left: 'mishkan', right: 'Dwelling place' },
      { left: 'mikdash', right: 'Holy place' },
      { left: 'ohel', right: 'Tent' },
    ],
    why: 'The words.',
  }),
  q('q-written', { type: 'written', model: 'Grace before merit.', covers: 'grace, merit', points: 3 }),
];

const quiz: Quiz = {
  id: 'Q-PROD',
  title: 'The Prodigal Son',
  draws_from: ['B-K41'],
  created_by: 'ada',
  proctors: [],
  status: 'open',
  closed: false,
  rank: 1,
  course: null,
  shuffle_questions: true,
  shuffle_options: false,
  guest_name: 'optional',
  questions: every,
  path: 'academy/prodigal.md',
  local: false,
};

test('the guest copy holds every question as it is asked and no answer, reason, accepted answer, or model answer', () => {
  const copy = guestCopy(quiz, every, 'Parables');
  assert.equal(copy.academy, 1);
  assert.equal(copy.quiz, 'Q-PROD');
  assert.equal(copy.course, 'Parables');
  assert.equal(copy.guest_name, 'optional');
  assert.deepEqual(
    copy.questions.map((each) => each.type),
    ['choice', 'truefalse', 'all', 'short', 'order', 'match', 'written'],
  );
  const text = JSON.stringify(copy);
  for (const secret of ['Because B.', 'Sinai', 'Exodus 25', 'Grace before merit', 'grace, merit', 'The words.', '"answer"', '"correct"', '"accepted"', '"pairs"', 'example.com']) {
    assert.ok(!text.includes(secret), `the guest copy gives away ${secret}`);
  }
  const order = copy.questions.find((each) => each.type === 'order');
  assert.notDeepEqual(order?.items, ['Genesis', 'Exodus', 'Leviticus', 'Numbers'], 'never in the right order');
  assert.deepEqual([...(order?.items ?? [])].sort(), ['Exodus', 'Genesis', 'Leviticus', 'Numbers']);
  assert.deepEqual(guestCopy(quiz, every, null).questions.find((each) => each.type === 'order')?.items, order?.items, 'the same order every time');
  const match = copy.questions.find((each) => each.type === 'match');
  assert.deepEqual(match?.lefts, ['mishkan', 'mikdash', 'ohel']);
  assert.notDeepEqual(match?.rights, ['Dwelling place', 'Holy place', 'Tent']);
  assert.equal(copy.questions.find((each) => each.type === 'short')?.image, 'assets/map.png');
});

test('the key holds each answer as Eidos compares it, its points, and what may be shown once it is answered', () => {
  const key = shareKey(every, (id) => (id === 'B-K41' ? 'The Tabernacle' : null));
  const held = key.questions;
  assert.deepEqual(held['q-choice']?.['compare'], 'choice');
  assert.deepEqual(held['q-choice']?.['answer'], 1);
  assert.deepEqual(held['q-choice']?.['shown'], { right: 'Right', why: 'Because B.', reference: { text: 'The Tabernacle › The tabernacle' } });
  assert.deepEqual([held['q-all']?.['compare'], held['q-all']?.['answer'], held['q-all']?.['points']], ['set', [0, 2], 2]);
  assert.deepEqual([held['q-short']?.['compare'], held['q-short']?.['answer']], ['text', ['Sinai', 'Mount Sinai']]);
  assert.deepEqual((held['q-short']?.['shown'] as { reference: unknown }).reference, { url: 'https://example.com/sinai' });
  assert.deepEqual([held['q-order']?.['compare'], held['q-order']?.['answer']], ['order', ['Genesis', 'Exodus', 'Leviticus', 'Numbers']]);
  assert.deepEqual([held['q-match']?.['compare'], held['q-match']?.['answer']], ['pairs', ['Dwelling place', 'Holy place', 'Tent']]);
  // a written answer has nothing to compare: Eidos keeps it for a grader, and the guest sees the model answer
  assert.equal(held['q-written']?.['compare'], undefined);
  assert.deepEqual(held['q-written']?.['shown'], { right: 'Grace before merit.', why: '', reference: null, model: 'Grace before merit.', covers: 'grace, merit' });
});

test('a reference reads as words a guest can use: a blueprint by its title, an asset by its name, and a web link as a link', () => {
  const titleOf = (): string | null => null;
  assert.deepEqual(guestReference('assets/maps/sinai.png', titleOf), { text: 'sinai.png' });
  assert.deepEqual(guestReference('B-ZZ1', titleOf), { text: 'B-ZZ1' });
  assert.deepEqual(guestReference('Page 1', titleOf), { text: 'Page 1' });
  assert.equal(guestReference('', titleOf), null);
});

test("a guest's submission reads back as an attempt: scored as Eidos scored it, a written answer graded later, a removed question shown as removed", () => {
  const link = 'a'.repeat(40);
  const id = 'b'.repeat(32);
  const data = { quiz: 'Q-PROD', name: '  Rui  ', answers: { 'q-choice': 1, 'q-all': [0], 'q-written': 'Grace first', 'q-gone': 'x' } };
  const attempt = guestAttempt({ link, id, arrived: '2026-11-10T10:00:00Z', data, score: { answers: { 'q-choice': true, 'q-all': false, 'q-written': null, 'q-gone': true } } }, quiz);
  assert.ok(attempt);
  assert.equal(attempt.id, guestAttemptId(link, id));
  assert.deepEqual(attempt.guest, { name: 'Rui', link, submission: id });
  assert.equal(attempt.score, 1);
  assert.equal(attempt.total, 1 + 2 + 3 + 0);
  assert.equal(attempt.waiting, 1);
  assert.equal(attempt.answers.find((answer) => answer.question.id === 'q-gone')?.question.prompt, 'A question since removed from the quiz');
  // graded in To grade as a member's written answer is (REQ74)
  const grade: Grade = {
    id: 'g1',
    attempt: attempt.id,
    person: 'guest',
    quiz: 'Q-PROD',
    question: 'q-written',
    points: 2,
    note: '',
    by: 'ada',
    ai: false,
    suggestion: false,
    at: '2026-11-10T11:00:00Z',
  };
  const graded = applyGrades(attempt, [grade]);
  assert.equal(graded.score, 3);
  assert.equal(graded.waiting, 0);
  // another quiz's submission, or one that is not an attempt, is not this quiz's
  assert.equal(guestAttempt({ link, id, arrived: '2026-11-10T10:00:00Z', data: { ...data, quiz: 'Q-OTHER' } }, quiz), null);
  assert.equal(guestAttempt({ link, id, arrived: '2026-11-10T10:00:00Z', data: ['not', 'an', 'attempt'] }, quiz), null);
  // without Eidos's score, the same rules score it
  const unscored = guestAttempt({ link, id, arrived: '2026-11-10T10:00:00Z', data: { quiz: 'Q-PROD', name: null, answers: { 'q-short': ' mount sinai. ' } } }, quiz);
  assert.equal(unscored?.score, 1);
  assert.equal(unscored?.guest?.name, null);
});
