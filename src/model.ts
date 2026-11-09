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

export type QuizStatus = 'open' | 'closed';

export interface Quiz {
  id: string;
  title: string;
  // blueprint ids, asset paths, and links
  draws_from: string[];
  created_by: string | null;
  proctors: string[];
  // as it stands: open, unless a person closed it or it has no question to ask yet (statusOf)
  status: QuizStatus;
  // a person closed it, so it stays closed however many questions it has; all the file says
  closed: boolean;
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
  // a copy of the question as it was asked (Academy REQ17)
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
  const closed = data['status'] === 'closed';
  const questions = parseQuestions(body);
  return {
    id,
    title: text(data['title']).trim() || 'Untitled quiz',
    draws_from: strings(data['draws_from']),
    created_by: text(data['created_by']).trim() || null,
    proctors: strings(data['proctors']),
    status: statusOf({ closed, questions }),
    closed,
    rank: typeof data['rank'] === 'number' ? data['rank'] : Number.MAX_SAFE_INTEGER,
    course,
    questions,
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
      proctors: quiz.proctors,
      status: quiz.closed ? 'closed' : null,
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

export function askable(quiz: Pick<Quiz, 'questions'>): Question[] {
  return quiz.questions.filter((question) => questionProblems(question).length === 0);
}

// A quiz is open by default once it has a question to ask (Academy REQ40).
export function statusOf(quiz: Pick<Quiz, 'closed' | 'questions'>): QuizStatus {
  return quiz.closed || askable(quiz).length === 0 ? 'closed' : 'open';
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

// ---- a deck's file --------------------------------------------------------------------

// A deck is a quiz's sibling: one file in the same folder and courses, marked `type: deck`,
// its cards in the order they were written. Nothing in it, or in anything kept about it,
// says when a card should be studied: a person studies whenever they like.
export const DECK_TYPE = 'deck';
export const CARDS_A_SESSION = 20;

export interface Card {
  id: string;
  front: string;
  back: string;
  reference: string;
}

export interface Deck {
  id: string;
  title: string;
  draws_from: string[];
  // the quiz its first cards were made from, when they were
  made_from: string | null;
  created_by: string | null;
  proctors: string[];
  status: QuizStatus;
  closed: boolean;
  rank: number;
  course: string | null;
  // how many cards Study takes at a time
  per_session: number;
  cards: Card[];
  path: string;
}

// A card reads as a page, the way a question does:
//
//   ## c-abc12
//
//   What does mishkan mean?
//
//   **Back:** "Dwelling place," from shakan, to dwell.
//
//   **Reference:** Lesson 10, section A
const BACK = /^\*\*Back:\*\*\s*(.*)$/;

export function parseCards(body: string): Card[] {
  const cards: Card[] = [];
  let held: { id: string; front: string[]; back: string[]; reference: string; part: 'front' | 'back' | 'done' } | null = null;
  const finish = (): void => {
    if (!held) return;
    cards.push({ id: held.id, front: held.front.join('\n').trim(), back: held.back.join('\n').trim(), reference: held.reference });
    held = null;
  };
  for (const line of body.split(/\r?\n/)) {
    const heading = /^##\s+(\S+)\s*$/.exec(line);
    if (heading) {
      finish();
      held = { id: heading[1]!, front: [], back: [], reference: '', part: 'front' };
      continue;
    }
    if (!held) continue;
    const back = BACK.exec(line);
    if (back) {
      held.back.push(back[1]!);
      held.part = 'back';
      continue;
    }
    const reference = REFERENCE.exec(line);
    if (reference) {
      held.reference = reference[1]!.trim();
      held.part = 'done';
      continue;
    }
    if (held.part === 'front') held.front.push(line);
    else if (held.part === 'back') held.back.push(line);
  }
  finish();
  return cards;
}

export function renderCards(cards: Card[]): string {
  return cards
    .map((card) => {
      const parts = [`## ${card.id}`, card.front.trim()];
      if (card.back.trim()) parts.push(`**Back:** ${card.back.trim()}`);
      if (card.reference.trim()) parts.push(`**Reference:** ${card.reference.replace(/\s*\n\s*/g, ' ').trim()}`);
      return parts.join('\n\n');
    })
    .join('\n\n');
}

// What is wrong with a card, in words a person acts on; empty when it can be studied.
export function cardProblems(card: Card): string[] {
  const problems: string[] = [];
  if (!card.front.trim()) problems.push('it has no front');
  if (!card.back.trim()) problems.push('it has no back');
  return problems;
}

export function studiable(deck: Pick<Deck, 'cards'>): Card[] {
  return deck.cards.filter((card) => cardProblems(card).length === 0);
}

// A deck is open once it has a card to study, unless a person closed it, as a quiz is.
export function deckStatusOf(deck: Pick<Deck, 'closed' | 'cards'>): QuizStatus {
  return deck.closed || studiable(deck).length === 0 ? 'closed' : 'open';
}

// Whether a file of the plugin's folder is a deck, read from its frontmatter alone.
export function isDeckSource(source: string): boolean {
  try {
    return splitFrontmatter(source).data['type'] === DECK_TYPE;
  } catch {
    return false;
  }
}

export function parseDeck(source: string, path: string, course: string | null): Deck {
  const { data, body } = splitFrontmatter(source);
  const id = text(data['id']).trim();
  if (!id) throw new Error('it has no id');
  const closed = data['status'] === 'closed';
  const cards = parseCards(body);
  const size = Number(data['per_session']);
  return {
    id,
    title: text(data['title']).trim() || 'Untitled deck',
    draws_from: strings(data['draws_from']),
    made_from: text(data['made_from']).trim() || null,
    created_by: text(data['created_by']).trim() || null,
    proctors: strings(data['proctors']),
    status: deckStatusOf({ closed, cards }),
    closed,
    rank: typeof data['rank'] === 'number' ? data['rank'] : Number.MAX_SAFE_INTEGER,
    course,
    per_session: Number.isInteger(size) && size > 0 ? size : CARDS_A_SESSION,
    cards,
    path,
  };
}

export function renderDeck(deck: Deck): string {
  return joinFrontmatter(
    {
      id: deck.id,
      type: DECK_TYPE,
      title: deck.title,
      draws_from: deck.draws_from,
      made_from: deck.made_from,
      created_by: deck.created_by,
      proctors: deck.proctors,
      status: deck.closed ? 'closed' : null,
      rank: deck.rank === Number.MAX_SAFE_INTEGER ? null : deck.rank,
      per_session: deck.per_session === CARDS_A_SESSION ? null : deck.per_session,
    },
    renderCards(deck.cards),
  );
}

// A quiz's questions as cards: the prompt on the front, the answer and why it is right on the back.
export function cardsFromQuiz(quiz: Pick<Quiz, 'questions'>, newId: () => string): Card[] {
  return askable(quiz).map((question) => {
    const answer = question.options[question.answer!]!.trim();
    const why = question.why.trim();
    return { id: newId(), front: question.prompt.trim(), back: why ? `${answer}. ${why}` : answer, reference: question.reference.trim() };
  });
}

// ---- studying a deck ------------------------------------------------------------------------

// What Study takes: the next cards (still learning first, then not yet seen, then the
// learned ones studied longest ago), the ones missed last time, or the whole deck.
export type StudyMode = 'next' | 'missed' | 'whole';
export const STUDY_MODES: readonly StudyMode[] = ['next', 'missed', 'whole'];

export interface ReviewAnswer {
  // a copy of the card as it was studied, so editing or deleting it never changes the past
  card: Card;
  got: boolean;
  at: string;
}

// One sitting with one deck: every answer in the order it was given, a card missed and
// shown again later in the sitting answered twice.
export interface Review {
  id: string;
  deck: string;
  deck_title: string;
  by: string;
  mode: StudyMode;
  started_at: string;
  completed_at: string;
  answers: ReviewAnswer[];
}

export function makeReview(input: { id: string; deck: Deck; by: string; mode: StudyMode; startedAt: string; completedAt: string; answers: Array<{ card: string; got: boolean; at?: string }> }): Review {
  const byId = new Map(input.deck.cards.map((card) => [card.id, card]));
  const answers: ReviewAnswer[] = input.answers.map((answer) => {
    const card = byId.get(answer.card);
    if (!card) throw new Error(`the deck has no card ${answer.card}; it may have changed while you were studying`);
    if (typeof answer.got !== 'boolean') throw new Error(`card ${answer.card} needs Got it or Still learning`);
    return { card: { ...card }, got: answer.got, at: answer.at ?? input.completedAt };
  });
  if (answers.length === 0) throw new Error('a study session answers at least one card');
  if (!STUDY_MODES.includes(input.mode)) throw new Error('a study session takes the next cards, the missed ones, or the whole deck');
  return { id: input.id, deck: input.deck.id, deck_title: input.deck.title, by: input.by, mode: input.mode, started_at: input.startedAt, completed_at: input.completedAt, answers };
}

export function parseReview(source: string): Review {
  const data = parseYaml(source) as Review;
  if (!data || typeof data !== 'object' || !data.id || !data.deck || !Array.isArray(data.answers)) throw new Error('it is not a study session');
  return data;
}

export function renderReview(review: Review): string {
  return stringifyYaml(review, { lineWidth: 0 });
}

export type CardState = 'new' | 'learning' | 'learned';

export interface CardStanding {
  id: string;
  state: CardState;
  // when the person last studied it, and how they answered: a record, never a reminder
  last_seen: string | null;
  last_got: boolean | null;
}

const reviewOrder = (a: Review, b: Review): number => a.completed_at.localeCompare(b.completed_at) || a.id.localeCompare(b.id);

// Learned is two Got it in a row, the latest answers deciding; one missed puts it back to learning.
function stateOf(answers: boolean[]): CardState {
  if (answers.length === 0) return 'new';
  return answers.length >= 2 && answers.at(-1) === true && answers.at(-2) === true ? 'learned' : 'learning';
}

export function standings(deck: Pick<Deck, 'cards'>, reviews: Review[]): Map<string, CardStanding> {
  const answered = new Map<string, { answers: boolean[]; at: string }>();
  for (const review of [...reviews].sort(reviewOrder)) {
    for (const answer of review.answers) {
      const held = answered.get(answer.card.id) ?? { answers: [], at: answer.at };
      held.answers.push(answer.got);
      held.at = answer.at;
      answered.set(answer.card.id, held);
    }
  }
  return new Map(
    studiable(deck).map((card) => {
      const held = answered.get(card.id);
      return [card.id, { id: card.id, state: stateOf(held?.answers ?? []), last_seen: held?.at ?? null, last_got: held ? held.answers.at(-1)! : null }];
    }),
  );
}

export interface DeckProgress {
  new: number;
  learning: number;
  learned: number;
  of: number;
  last_studied: string | null;
  // newest first, without the cards
  history: Array<{ id: string; mode: StudyMode; cards: number; still_learning: number; learned_after: number; completed_at: string; shared: boolean }>;
}

// A person's way through a deck. `shared` says which sessions were committed with the project.
export function deckProgress(deck: Pick<Deck, 'cards'>, reviews: Array<Review & { shared?: boolean }>): DeckProgress {
  const held = standings(deck, reviews);
  const count = (state: CardState): number => [...held.values()].filter((standing) => standing.state === state).length;
  const sorted = [...reviews].sort(reviewOrder);
  const history = sorted.map((review, index) => {
    const finals = new Map<string, boolean>();
    for (const answer of review.answers) finals.set(answer.card.id, answer.got);
    const after = standings(deck, sorted.slice(0, index + 1));
    return {
      id: review.id,
      mode: review.mode,
      cards: finals.size,
      still_learning: [...finals.values()].filter((got) => !got).length,
      learned_after: [...after.values()].filter((standing) => standing.state === 'learned').length,
      completed_at: review.completed_at,
      shared: review.shared !== false,
    };
  });
  return { new: count('new'), learning: count('learning'), learned: count('learned'), of: held.size, last_studied: sorted.at(-1)?.completed_at ?? null, history: history.reverse() };
}

// The cards a sitting takes, in the order they come. `next` brings the cards still being
// learned first, the longest unseen of them first, then the ones never seen in the deck's
// order, then the learned ones studied longest ago; `missed`, the cards whose last answer
// in the latest sitting was Still learning; `whole`, every card in order.
export function cardsToStudy(deck: Pick<Deck, 'cards' | 'per_session'>, reviews: Review[], mode: StudyMode, size: number = deck.per_session): string[] {
  const cards = studiable(deck);
  if (mode === 'whole') return cards.map((card) => card.id);
  if (mode === 'missed') {
    const latest = [...reviews].sort(reviewOrder).at(-1);
    if (!latest) return [];
    const finals = new Map<string, boolean>();
    for (const answer of latest.answers) finals.set(answer.card.id, answer.got);
    return cards.filter((card) => finals.get(card.id) === false).map((card) => card.id);
  }
  return orderForStudy(deck, reviews)
    .slice(0, size)
    .map((standing) => standing.id);
}

// Still learning (longest unseen first), then never seen (in order), then learned (studied longest ago first).
function orderForStudy(deck: Pick<Deck, 'cards'>, reviews: Review[]): CardStanding[] {
  const held = [...standings(deck, reviews).values()];
  const oldest = (a: CardStanding, b: CardStanding): number => (a.last_seen ?? '').localeCompare(b.last_seen ?? '');
  return [...held.filter((standing) => standing.state === 'learning').sort(oldest), ...held.filter((standing) => standing.state === 'new'), ...held.filter((standing) => standing.state === 'learned').sort(oldest)];
}

// A sitting across several decks, in the same order, the decks taking turns within each kind.
export function cardsAcross(decks: Array<{ deck: Pick<Deck, 'id' | 'cards'>; reviews: Review[] }>, size: number): Array<{ deck: string; card: string }> {
  const tiers: Array<Array<Array<{ deck: string; card: string; last_seen: string | null }>>> = [[], [], []];
  const rank: Record<CardState, number> = { learning: 0, new: 1, learned: 2 };
  for (const { deck, reviews } of decks) {
    const lists: Array<Array<{ deck: string; card: string; last_seen: string | null }>> = [[], [], []];
    for (const standing of orderForStudy(deck, reviews)) lists[rank[standing.state]]!.push({ deck: deck.id, card: standing.id, last_seen: standing.last_seen });
    lists.forEach((list, tier) => list.length > 0 && tiers[tier]!.push(list));
  }
  const out: Array<{ deck: string; card: string }> = [];
  for (const lists of tiers) {
    for (let turn = 0; out.length < size && lists.some((list) => turn < list.length); turn += 1) {
      for (const list of lists) if (turn < list.length && out.length < size) out.push({ deck: list[turn]!.deck, card: list[turn]!.card });
    }
  }
  return out;
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

// Totals only: no name, score, or answer of anyone else leaves this function (Academy REQ20).
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

// One person's way through a course's quizzes, in the course's order, from their official
// attempts. The attempts taken before they enrolled count: they are the same person's scores.
export interface CourseQuizProgress {
  id: string;
  title: string;
  place: number;
  status: QuizStatus;
  attempts: number;
  latest: number | null;
  best: number | null;
  last_taken: string | null;
  // newest first
  history: PersonResult['history'];
}

export interface CourseProgress {
  taken: number;
  of: number;
  average_best: number | null;
  last_taken: string | null;
  quizzes: CourseQuizProgress[];
}

export function courseProgress(quizzes: Array<Pick<Quiz, 'id' | 'title' | 'status'>>, official: Attempt[], alias: string): CourseProgress {
  const rows = quizzes.map((quiz, index) => {
    const result = everyone(official.filter((attempt) => attempt.quiz === quiz.id && attempt.by === alias))[0];
    return {
      id: quiz.id,
      title: quiz.title,
      place: index + 1,
      status: quiz.status,
      attempts: result?.attempts ?? 0,
      latest: result?.latest ?? null,
      best: result?.best ?? null,
      last_taken: result?.last_taken ?? null,
      history: result?.history ?? [],
    };
  });
  const taken = rows.filter((row) => row.attempts > 0);
  return {
    taken: taken.length,
    of: rows.length,
    average_best: taken.length > 0 ? taken.reduce((sum, row) => sum + row.best!, 0) / taken.length : null,
    last_taken:
      taken
        .map((row) => row.last_taken!)
        .sort()
        .at(-1) ?? null,
    quizzes: rows,
  };
}

// May this person see everyone's results (Academy REQ21), or change the quiz (REQ10, REQ22)?
export interface Person {
  alias: string | null;
  owner: boolean;
}

// Who someone counts as for those two questions. No user selected is full facilitation, as a
// blank me.md is, and a project that marks no owner leaves everyone one, as a project that marks
// no editor leaves everyone an editor.
export function accessOf(me: Person | null, someoneIsOwner: boolean): Person {
  if (!me) return { alias: null, owner: true };
  return someoneIsOwner ? me : { alias: me.alias, owner: true };
}

export function canSeeResults(quiz: Pick<Quiz, 'created_by' | 'proctors'>, person: Person | null): boolean {
  if (!person) return false;
  // made while nobody was known, it has no creator to keep it from anyone
  if (person.owner || quiz.created_by === null) return true;
  return person.alias !== null && (person.alias === quiz.created_by || quiz.proctors.includes(person.alias));
}

// May this person see who enrolled in a course and each one's scores across it (Academy REQ43)?
// A quiz with no known creator opens that quiz to everyone, never the whole course, so only a
// person the course's quizzes actually name counts here.
export function canSeeCourse(course: Pick<Course, 'created_by'>, quizzes: Array<Pick<Quiz, 'created_by' | 'proctors'>>, person: Person | null): boolean {
  if (!person) return false;
  if (person.owner || course.created_by === null) return true;
  const alias = person.alias;
  return alias !== null && (alias === course.created_by || quizzes.some((quiz) => alias === quiz.created_by || quiz.proctors.includes(alias)));
}

// Change the quiz: its questions, its title, what it draws from, and its course.
export function canEdit(thing: { created_by: string | null; proctors?: string[] }, person: Person | null): boolean {
  if (canManage(thing, person)) return true;
  return person !== null && person.alias !== null && (thing.proctors ?? []).includes(person.alias);
}

// Change who holds it: its proctors and its creator, and delete it.
export function canManage(thing: { created_by: string | null }, person: Person | null): boolean {
  if (!person) return false;
  return person.owner || thing.created_by === null || (person.alias !== null && person.alias === thing.created_by);
}
