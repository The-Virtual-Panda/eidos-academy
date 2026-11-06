// What a quiz, a course, and an attempt are, and the pure work on them: reading
// and writing their files, and every sum a score page shows. Nothing here touches
// the disk, so the page, the commands, and the tests all get the same answers.
import { randomBytes } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface Question {
  id: string;
  prompt: string;
  options: string[];
  // the index of the right option, null while the question has none marked
  answer: number | null;
  why: string;
  reference: string;
}

export interface Quiz {
  id: string;
  title: string;
  // blueprint ids, asset paths, and links
  draws_from: string[];
  created_by: string | null;
  results_proctors: string[];
  // its place in its course
  rank: number;
  // the course's id, from the folder it sits in; null for a one-off
  course: string | null;
  questions: Question[];
  // root-relative
  path: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  created_by: string | null;
  // collections, categories (`specs/old-testament`), and blueprint ids
  content: string[];
  study_plan: string[];
  // root-relative path of its course.md
  path: string;
}

export type AttemptKind = 'official' | 'practice';
export type AttemptMode = 'whole' | 'missed' | 'unseen';

export interface AttemptAnswer {
  // a copy of the question as it was asked (Quizzes REQ17)
  question: Omit<Question, 'answer'> & { answer: number };
  chosen: number;
}

export interface Attempt {
  id: string;
  quiz: string;
  quiz_title: string;
  kind: AttemptKind;
  mode: AttemptMode;
  by: string;
  completed_at: string;
  score: number;
  total: number;
  answers: AttemptAnswer[];
}

// ---- ids ---------------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

export function drawId(prefix: string, taken: Iterable<string> = [], length = 4): string {
  const held = new Set(taken);
  for (;;) {
    const id = `${prefix}${[...randomBytes(length)].map((byte) => ALPHABET[byte % ALPHABET.length]).join('')}`;
    if (!held.has(id)) return id;
  }
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'untitled';
}

// ---- frontmatter --------------------------------------------------------------------

function splitFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error('it has no frontmatter');
  const data = parseYaml(match[1]!) as unknown;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('its frontmatter is not a set of keys');
  return { data: data as Record<string, unknown>, body: text.slice(match[0].length) };
}

function strings(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => String(item).trim()).filter((item) => item !== '');
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function joinFrontmatter(data: Record<string, unknown>, body: string): string {
  const kept = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null && value !== undefined));
  return `---\n${stringifyYaml(kept, { lineWidth: 0 })}---\n\n${body.trim()}\n`;
}

// ---- a quiz's file -------------------------------------------------------------------

// A quiz reads as a page: each question under a heading holding its id, its prompt, its
// options as a checklist with the answer ticked, then the reason and the reference.
//
//   ## q-abc12
//
//   Like other temples of the ancient world, the tabernacle was viewed primarily as what?
//
//   - [x] A residence for God
//   - [ ] A gathering place for the people
//
//   **Why:** The lecturer stresses it was where God lived.
//
//   **Reference:** Lesson 10, section A
const OPTION = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;
const WHY = /^\*\*Why:\*\*\s*(.*)$/;
const REFERENCE = /^\*\*Reference:\*\*\s*(.*)$/;

export function parseQuestions(body: string): Question[] {
  const questions: Question[] = [];
  interface Reading {
    id: string;
    prompt: string[];
    options: string[];
    answer: number | null;
    why: string[];
    reference: string;
    part: 'prompt' | 'why' | 'done';
  }
  let held: Reading | null = null;
  const finish = (): void => {
    if (!held) return;
    questions.push({ id: held.id, prompt: held.prompt.join('\n').trim(), options: held.options, answer: held.answer, why: held.why.join('\n').trim(), reference: held.reference });
    held = null;
  };
  for (const line of body.split(/\r?\n/)) {
    const heading = /^##\s+(\S+)\s*$/.exec(line);
    if (heading) {
      finish();
      held = { id: heading[1]!, prompt: [], options: [], answer: null, why: [], reference: '', part: 'prompt' };
      continue;
    }
    if (!held) continue;
    const option = OPTION.exec(line);
    if (option) {
      if (option[1]!.toLowerCase() === 'x' && held.answer === null) held.answer = held.options.length;
      held.options.push(option[2]!.trim());
      held.part = 'done';
      continue;
    }
    const why = WHY.exec(line);
    if (why) {
      held.why.push(why[1]!);
      held.part = 'why';
      continue;
    }
    const reference = REFERENCE.exec(line);
    if (reference) {
      held.reference = reference[1]!.trim();
      held.part = 'done';
      continue;
    }
    if (held.part === 'prompt') held.prompt.push(line);
    else if (held.part === 'why') held.why.push(line);
  }
  finish();
  return questions;
}

export function renderQuestions(questions: Question[]): string {
  return questions
    .map((question) => {
      const options = question.options.map((option, index) => `- [${index === question.answer ? 'x' : ' '}] ${option.replace(/\s*\n\s*/g, ' ').trim()}`).join('\n');
      const parts = [`## ${question.id}`, question.prompt.trim(), options];
      if (question.why.trim()) parts.push(`**Why:** ${question.why.trim()}`);
      if (question.reference.trim()) parts.push(`**Reference:** ${question.reference.replace(/\s*\n\s*/g, ' ').trim()}`);
      return parts.join('\n\n');
    })
    .join('\n\n');
}

export function parseQuiz(source: string, path: string, course: string | null): Quiz {
  const { data, body } = splitFrontmatter(source);
  const id = text(data['id']).trim();
  if (!id) throw new Error('it has no id');
  return {
    id,
    title: text(data['title']).trim() || 'Untitled quiz',
    draws_from: strings(data['draws_from']),
    created_by: text(data['created_by']).trim() || null,
    results_proctors: strings(data['results_proctors']),
    rank: typeof data['rank'] === 'number' ? data['rank'] : Number.MAX_SAFE_INTEGER,
    course,
    questions: parseQuestions(body),
    path,
  };
}

export function renderQuiz(quiz: Quiz): string {
  return joinFrontmatter(
    {
      id: quiz.id,
      title: quiz.title,
      draws_from: quiz.draws_from,
      created_by: quiz.created_by,
      results_proctors: quiz.results_proctors,
      rank: quiz.rank === Number.MAX_SAFE_INTEGER ? null : quiz.rank,
    },
    renderQuestions(quiz.questions),
  );
}

// What is wrong with a question, in words a person acts on; empty when it can be asked.
export function questionProblems(question: Question): string[] {
  const problems: string[] = [];
  if (!question.prompt.trim()) problems.push('it has no prompt');
  if (question.options.length < 2 || question.options.length > 5)
    problems.push(`it has ${question.options.length} option${question.options.length === 1 ? '' : 's'}, and a question takes two to five`);
  if (question.options.some((option) => !option.trim())) problems.push('one of its options is empty');
  if (question.answer === null || question.answer < 0 || question.answer >= question.options.length) problems.push('none of its options is marked as the answer');
  return problems;
}

export function askable(quiz: Quiz): Question[] {
  return quiz.questions.filter((question) => questionProblems(question).length === 0);
}

// ---- a course's file -----------------------------------------------------------------

export function parseCourse(source: string, path: string): Course {
  const { data, body } = splitFrontmatter(source);
  const id = text(data['id']).trim();
  if (!id) throw new Error('it has no id');
  return {
    id,
    title: text(data['title']).trim() || 'Untitled course',
    description: body.trim(),
    created_by: text(data['created_by']).trim() || null,
    content: strings(data['content']),
    study_plan: strings(data['study_plan']),
    path,
  };
}

export function renderCourse(course: Course): string {
  return joinFrontmatter({ id: course.id, title: course.title, created_by: course.created_by, content: course.content, study_plan: course.study_plan }, course.description);
}

// ---- an attempt -----------------------------------------------------------------------

export function parseAttempt(source: string): Attempt {
  const data = parseYaml(source) as Attempt;
  if (!data || typeof data !== 'object' || !data.id || !data.quiz || !Array.isArray(data.answers)) throw new Error('it is not an attempt');
  return data;
}

export function renderAttempt(attempt: Attempt): string {
  return stringifyYaml(attempt, { lineWidth: 0 });
}

export function makeAttempt(input: { id: string; quiz: Quiz; kind: AttemptKind; mode: AttemptMode; by: string; completedAt: string; answers: Array<{ question: string; chosen: number }> }): Attempt {
  const byId = new Map(input.quiz.questions.map((question) => [question.id, question]));
  const answers: AttemptAnswer[] = input.answers.map((answer) => {
    const question = byId.get(answer.question);
    if (!question) throw new Error(`the quiz has no question ${answer.question}; it may have changed while you were taking it`);
    if (question.answer === null) throw new Error(`question ${answer.question} has no answer marked`);
    if (!Number.isInteger(answer.chosen) || answer.chosen < 0 || answer.chosen >= question.options.length) throw new Error(`question ${answer.question} has no option ${answer.chosen}`);
    return { question: { id: question.id, prompt: question.prompt, options: question.options, answer: question.answer, why: question.why, reference: question.reference }, chosen: answer.chosen };
  });
  if (answers.length === 0) throw new Error('an attempt answers at least one question');
  if (input.kind === 'official') {
    const asked = new Set(answers.map((answer) => answer.question.id));
    if (askable(input.quiz).some((question) => !asked.has(question.id))) throw new Error('an official attempt answers the whole quiz');
  }
  return {
    id: input.id,
    quiz: input.quiz.id,
    quiz_title: input.quiz.title,
    kind: input.kind,
    mode: input.mode,
    by: input.by,
    completed_at: input.completedAt,
    score: answers.filter((answer) => answer.chosen === answer.question.answer).length,
    total: answers.length,
    answers,
  };
}

// ---- the sums --------------------------------------------------------------------------

const byTime = (a: Attempt, b: Attempt): number => a.completed_at.localeCompare(b.completed_at);
export const percent = (attempt: { score: number; total: number }): number => (attempt.total === 0 ? 0 : attempt.score / attempt.total);

// The questions of a quiz a person last missed and has not yet seen. The most recent
// answer to each question decides, whichever kind of attempt gave it.
export function practiceSets(quiz: Quiz, attempts: Attempt[]): { missed: string[]; unseen: string[] } {
  const latest = new Map<string, boolean>();
  for (const attempt of [...attempts].sort(byTime)) {
    for (const answer of attempt.answers) latest.set(answer.question.id, answer.chosen === answer.question.answer);
  }
  const questions = askable(quiz);
  return {
    missed: questions.filter((question) => latest.get(question.id) === false).map((question) => question.id),
    unseen: questions.filter((question) => !latest.has(question.id)).map((question) => question.id),
  };
}

export interface MyScores {
  best: { percent: number; score: number; total: number; completed_at: string } | null;
  latest: { percent: number; score: number; total: number; completed_at: string; change: number | null } | null;
  official_attempts: number;
  first_official: string | null;
  // oldest first
  over_time: Array<{ percent: number; score: number; total: number; completed_at: string }>;
  // newest first, without the questions
  history: Array<{ id: string; kind: AttemptKind; mode: AttemptMode; score: number; total: number; percent: number; completed_at: string }>;
}

export function myScores(attempts: Attempt[]): MyScores {
  const sorted = [...attempts].sort(byTime);
  const official = sorted.filter((attempt) => attempt.kind === 'official');
  const point = (attempt: Attempt) => ({ percent: percent(attempt), score: attempt.score, total: attempt.total, completed_at: attempt.completed_at });
  let best: Attempt | null = null;
  for (const attempt of official) if (!best || percent(attempt) >= percent(best)) best = attempt;
  const last = official[official.length - 1] ?? null;
  const before = official[official.length - 2] ?? null;
  return {
    best: best ? point(best) : null,
    latest: last ? { ...point(last), change: before ? percent(last) - percent(before) : null } : null,
    official_attempts: official.length,
    first_official: official[0]?.completed_at ?? null,
    over_time: official.map(point),
    history: sorted
      .reverse()
      .map((attempt) => ({ id: attempt.id, kind: attempt.kind, mode: attempt.mode, score: attempt.score, total: attempt.total, percent: percent(attempt), completed_at: attempt.completed_at })),
  };
}

export const BANDS = ['Below 60%', '60s', '70s', '80s', '90% and up'] as const;

export function bandOf(fraction: number): number {
  const score = Math.round(fraction * 100);
  if (score < 60) return 0;
  if (score < 70) return 1;
  if (score < 80) return 2;
  if (score < 90) return 3;
  return 4;
}

function latestByPerson(attempts: Attempt[]): Map<string, Attempt> {
  const latest = new Map<string, Attempt>();
  for (const attempt of [...attempts].sort(byTime)) latest.set(attempt.by, attempt);
  return latest;
}

export interface Comparison {
  average: number | null;
  people: number;
  bands: Array<{ label: string; count: number; mine: boolean }>;
  mine: number | null;
}

// Totals only: no name, score, or answer of anyone else leaves this function (Quizzes REQ20).
export function compare(official: Attempt[], me: string | null): Comparison {
  const latest = [...latestByPerson(official).entries()];
  const counts = BANDS.map(() => 0);
  let sum = 0;
  for (const [, attempt] of latest) {
    counts[bandOf(percent(attempt))]! += 1;
    sum += percent(attempt);
  }
  const mine = me !== null ? latestByPerson(official).get(me) : undefined;
  const myBand = mine ? bandOf(percent(mine)) : null;
  return {
    average: latest.length > 0 ? sum / latest.length : null,
    people: latest.length,
    bands: BANDS.map((label, index) => ({ label, count: counts[index]!, mine: index === myBand })),
    mine: mine ? percent(mine) : null,
  };
}

export interface PersonResult {
  alias: string;
  attempts: number;
  latest: number;
  best: number;
  last_taken: string;
  // newest first
  history: Array<{ id: string; score: number; total: number; percent: number; completed_at: string }>;
}

export function everyone(official: Attempt[]): PersonResult[] {
  const people = new Map<string, Attempt[]>();
  for (const attempt of [...official].sort(byTime)) people.set(attempt.by, [...(people.get(attempt.by) ?? []), attempt]);
  return [...people.entries()]
    .map(([alias, attempts]) => {
      const last = attempts[attempts.length - 1]!;
      return {
        alias,
        attempts: attempts.length,
        latest: percent(last),
        best: Math.max(...attempts.map(percent)),
        last_taken: last.completed_at,
        history: [...attempts].reverse().map((attempt) => ({ id: attempt.id, score: attempt.score, total: attempt.total, percent: percent(attempt), completed_at: attempt.completed_at })),
      };
    })
    .sort((a, b) => b.last_taken.localeCompare(a.last_taken));
}

// May this person see everyone's results (Quizzes REQ21), or change the quiz (REQ10, REQ22)?
export interface Person {
  alias: string | null;
  owner: boolean;
}

export function canSeeResults(quiz: Pick<Quiz, 'created_by' | 'results_proctors'>, person: Person | null): boolean {
  if (!person) return false;
  if (person.owner) return true;
  return person.alias !== null && (person.alias === quiz.created_by || quiz.results_proctors.includes(person.alias));
}

export function canEdit(thing: { created_by: string | null }, person: Person | null): boolean {
  if (!person) return false;
  return person.owner || (person.alias !== null && person.alias === thing.created_by);
}
