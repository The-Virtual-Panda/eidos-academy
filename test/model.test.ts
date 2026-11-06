// The pure work: a quiz's file reads back as it was written, and every sum a page shows.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canEdit, canSeeResults, compare, everyone, makeAttempt, myScores, parseQuestions, parseQuiz, practiceSets, renderQuiz, type Attempt, type Quiz } from '../src/model.ts';

const quiz: Quiz = {
  id: 'Q-AAAA',
  title: 'A quiz',
  draws_from: ['B-1', 'https://example.com'],
  created_by: 'ada',
  results_proctors: ['bo'],
  rank: 2,
  course: null,
  path: 'quizzes/a-quiz.md',
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

test('results go to the creator, proctors, and owners; editing to the creator and owners', () => {
  const held = { created_by: 'ada', results_proctors: ['bo'] };
  assert.ok(canSeeResults(held, { alias: 'ada', owner: false }));
  assert.ok(canSeeResults(held, { alias: 'bo', owner: false }));
  assert.ok(canSeeResults(held, { alias: 'own', owner: true }));
  assert.ok(!canSeeResults(held, { alias: 'cy', owner: false }));
  assert.ok(!canSeeResults(held, null));
  assert.ok(canEdit(held, { alias: 'ada', owner: false }));
  assert.ok(canEdit(held, { alias: 'own', owner: true }));
  assert.ok(!canEdit(held, { alias: 'bo', owner: false }), 'a results proctor changes nothing');
});
