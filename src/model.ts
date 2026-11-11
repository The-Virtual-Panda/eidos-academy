// What a quiz, a course, and an attempt are, and the pure work on them: reading
// and writing their files, and every sum a score page shows. Nothing here touches
// the disk, so the page, the commands, and the tests all get the same answers.
import { randomBytes } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { answerText, blankQuestion, isRight, questionProblems, responseProblem, TYPE_WORDS, typeFromWords, type Question, type QuestionType, type Response } from './question.ts';

export * from './question.ts';

export type QuizStatus = 'open' | 'closed';
// how a guest taking the quiz from a public link gives their name (Academy REQ70)
export type GuestName = 'required' | 'optional' | 'none';
export const GUEST_NAMES: readonly GuestName[] = ['required', 'optional', 'none'];

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
  // each attempt takes the questions, and their options, in a new order (Academy REQ62)
  shuffle_questions: boolean;
  shuffle_options: boolean;
  guest_name: GuestName;
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

export interface GradeMark {
  points: number;
  note: string;
  by: string;
  ai: boolean;
  at: string;
}

export interface AttemptAnswer {
  // a copy of the question as it was asked (Academy REQ17)
  question: Question;
  // the option picked, kept for multiple choice and true or false as attempts before 0.3.0 had it
  chosen?: number;
  response: Response;
  // the points it earned; null while a written answer waits for a grade (Academy REQ63)
  earned: number | null;
  // a written answer in practice, marked by the person themselves (Academy REQ64)
  self_marked?: boolean;
  // filled from the grades when the attempt is read, never written in the attempt's file
  grade?: GradeMark;
  suggestion?: GradeMark;
}

export interface Attempt {
  id: string;
  quiz: string;
  quiz_title: string;
  kind: AttemptKind;
  mode: AttemptMode;
  by: string;
  completed_at: string;
  // points earned, and the points of every question asked
  score: number;
  total: number;
  answers: AttemptAnswer[];
  // how many written answers still wait for a grade; filled when the attempt is read
  waiting?: number;
  // a guest's attempt from a quiz's public link (Academy REQ71, REQ72): the name they gave, the link, and the submission Eidos
  // kept it as; never counted in a score of the project's people (REQ75)
  guest?: { name: string | null; link: string; submission: string };
}

// A grade of one written answer, kept in the grader's own folder (Academy REQ66).
export interface Grade {
  id: string;
  attempt: string;
  // whose attempt it is
  person: string;
  quiz: string;
  question: string;
  points: number;
  note: string;
  by: string;
  // the grader's own agent gave it
  ai: boolean;
  // a suggestion waits for the grader to accept or change it
  suggestion: boolean;
  at: string;
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

// A quiz reads as a page: each question under a heading holding its id, its type when it
// is not multiple choice, its prompt, then what its type takes, the reason, and the reference.
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
//   **Reference:** B-K41#A. The tabernacle
//
// Check all that are true ticks every right option; a short answer lists its accepted answers
// as plain bullets; put in order numbers its items in their right order; match writes each
// pair as `- left → right`; a written answer has a **Model answer:** and **Covers:**.
const OPTION = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;
const ITEM = /^\s*\d+[.)]\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const PAIR = /^(.*?)\s*(?:→|->)\s*(.*)$/;
const REFERENCE = /^\*\*Reference:\*\*\s*(.*)$/;
const FIELD = /^\*\*(Type|Context|Image|Points|Why|Reference|Model answer|Covers):\*\*\s*(.*)$/;

export function parseQuestions(body: string): Question[] {
  const questions: Question[] = [];
  type Part = 'prompt' | 'context' | 'why' | 'model' | 'covers' | 'done';
  type Reading = Question & { lines: Record<Exclude<Part, 'done'>, string[]>; part: Part };
  let held: Reading | null = null;
  const finish = (): void => {
    if (!held) return;
    const { lines, part: _part, ...question } = held;
    questions.push({
      ...question,
      prompt: lines.prompt.join('\n').trim(),
      context: lines.context.join('\n').trim(),
      why: lines.why.join('\n').trim(),
      model: lines.model.join('\n').trim(),
      covers: lines.covers.join('\n').trim(),
      answer: question.correct[0] ?? null,
    });
    held = null;
  };
  for (const line of body.split(/\r?\n/)) {
    const heading = /^##\s+(\S+)\s*$/.exec(line);
    if (heading) {
      finish();
      held = { ...blankQuestion(heading[1]!), options: [], lines: { prompt: [], context: [], why: [], model: [], covers: [] }, part: 'prompt' };
      continue;
    }
    if (!held) continue;
    const current: Reading = held;
    const field = FIELD.exec(line);
    if (field) {
      const [, key, value] = field;
      const single = (): void => {
        current.part = current.lines.prompt.join('').trim() ? 'done' : 'prompt';
      };
      if (key === 'Type') {
        current.type = typeFromWords(value!) ?? 'choice';
        single();
      } else if (key === 'Image') {
        current.image = value!.trim();
        single();
      } else if (key === 'Points') {
        const points = Number.parseInt(value!, 10);
        current.points = Number.isInteger(points) && points > 0 ? points : 1;
        single();
      } else if (key === 'Reference') {
        current.reference = value!.trim();
        current.part = 'done';
      } else {
        const part = key === 'Context' ? 'context' : key === 'Why' ? 'why' : key === 'Model answer' ? 'model' : 'covers';
        current.lines[part].push(value!);
        current.part = part;
      }
      continue;
    }
    const option = OPTION.exec(line);
    if (option) {
      if (option[1]!.toLowerCase() === 'x') current.correct.push(current.options.length);
      current.options.push(option[2]!.trim());
      current.part = 'done';
      continue;
    }
    const item = ITEM.exec(line);
    if (item && current.type === 'order') {
      current.items.push(item[1]!.trim());
      current.part = 'done';
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet && (current.type === 'short' || current.type === 'match')) {
      const pair = current.type === 'match' ? PAIR.exec(bullet[1]!) : null;
      if (pair) current.pairs.push({ left: pair[1]!.trim(), right: pair[2]!.trim() });
      else if (current.type === 'short') current.accepted.push(bullet[1]!.trim());
      current.part = 'done';
      continue;
    }
    if (current.part !== 'done') current.lines[current.part].push(line);
  }
  finish();
  return questions;
}

const oneLine = (value: string): string => value.replace(/\s*\n\s*/g, ' ').trim();

export function renderQuestions(questions: Question[]): string {
  return questions
    .map((question) => {
      const parts = [`## ${question.id}`];
      if (question.type !== 'choice') parts.push(`**Type:** ${TYPE_WORDS[question.type]}`);
      parts.push(question.prompt.trim());
      if (question.context.trim()) parts.push(`**Context:** ${question.context.trim()}`);
      if (question.image.trim()) parts.push(`**Image:** ${question.image.trim()}`);
      if (question.points !== 1) parts.push(`**Points:** ${question.points}`);
      if (question.type === 'choice' || question.type === 'truefalse' || question.type === 'all') {
        const right = new Set(question.type === 'all' ? question.correct : question.answer === null ? [] : [question.answer]);
        parts.push(question.options.map((option, index) => `- [${right.has(index) ? 'x' : ' '}] ${oneLine(option)}`).join('\n'));
      } else if (question.type === 'short') {
        parts.push(question.accepted.map((answer) => `- ${oneLine(answer)}`).join('\n'));
      } else if (question.type === 'order') {
        parts.push(question.items.map((item, index) => `${index + 1}. ${oneLine(item)}`).join('\n'));
      } else if (question.type === 'match') {
        parts.push(question.pairs.map((pair) => `- ${oneLine(pair.left)} → ${oneLine(pair.right)}`).join('\n'));
      } else {
        if (question.model.trim()) parts.push(`**Model answer:** ${question.model.trim()}`);
        if (question.covers.trim()) parts.push(`**Covers:** ${question.covers.trim()}`);
      }
      if (question.why.trim()) parts.push(`**Why:** ${question.why.trim()}`);
      if (question.reference.trim()) parts.push(`**Reference:** ${oneLine(question.reference)}`);
      return parts.filter((part) => part !== '').join('\n\n');
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
    shuffle_questions: data['shuffle_questions'] !== false,
    shuffle_options: data['shuffle_options'] !== false,
    guest_name: GUEST_NAMES.includes(data['guest_name'] as GuestName) ? (data['guest_name'] as GuestName) : 'required',
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
      shuffle_questions: quiz.shuffle_questions ? null : false,
      shuffle_options: quiz.shuffle_options ? null : false,
      guest_name: quiz.guest_name === 'required' ? null : quiz.guest_name,
    },
    renderQuestions(quiz.questions),
  );
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

// A quiz's questions as cards: the prompt on the front, and on the back its answer in words,
// with why it is right (Academy REQ48).
export function cardsFromQuiz(quiz: Pick<Quiz, 'questions'>, newId: () => string): Card[] {
  return askable(quiz).map((question) => {
    // a card shows one way to say a short answer, the first, not every spelling accepted
    const answer = (question.type === 'short' ? (question.accepted.find((held) => held.trim()) ?? '').trim() : answerText(question)).replace(/[.\s]+$/, '');
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

export function makeReview(input: {
  id: string;
  deck: Deck;
  by: string;
  mode: StudyMode;
  startedAt: string;
  completedAt: string;
  answers: Array<{ card: string; got: boolean; at?: string }>;
}): Review {
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
  return [
    ...held.filter((standing) => standing.state === 'learning').sort(oldest),
    ...held.filter((standing) => standing.state === 'new'),
    ...held.filter((standing) => standing.state === 'learned').sort(oldest),
  ];
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

// An attempt from before 0.3.0 holds multiple choice alone, one point a question, the option
// picked as `chosen`; it reads as one of today's.
function upgradeQuestion(question: Partial<Question> & { id: string }): Question {
  const base = blankQuestion(question.id, question.type ?? 'choice');
  const merged = { ...base, ...question, options: question.options ?? base.options };
  if (!question.correct) merged.correct = typeof question.answer === 'number' ? [question.answer] : [];
  merged.answer = merged.correct[0] ?? null;
  return merged;
}

export function parseAttempt(source: string): Attempt {
  const data = parseYaml(source) as Attempt;
  if (!data || typeof data !== 'object' || !data.id || !data.quiz || !Array.isArray(data.answers)) throw new Error('it is not an attempt');
  data.answers = data.answers.map((answer) => {
    const question = upgradeQuestion(answer.question);
    const response = answer.response ?? answer.chosen ?? null;
    const earned = answer.earned === undefined ? (isRight(question, response as Response) ? question.points : 0) : answer.earned;
    return { ...answer, question, response: response as Response, earned };
  });
  return data;
}

export function renderAttempt(attempt: Attempt): string {
  const { waiting: _waiting, ...kept } = attempt;
  return stringifyYaml({ ...kept, answers: kept.answers.map(({ grade: _grade, suggestion: _suggestion, ...answer }) => answer) }, { lineWidth: 0 });
}

export interface GivenAnswer {
  question: string;
  response?: Response;
  // the option picked, as the page and the commands sent it before 0.3.0
  chosen?: number;
  // a written answer in practice: the person's own mark against the model answer
  self_marked?: boolean;
}

export function makeAttempt(input: { id: string; quiz: Quiz; kind: AttemptKind; mode: AttemptMode; by: string; completedAt: string; answers: GivenAnswer[] }): Attempt {
  const byId = new Map(input.quiz.questions.map((question) => [question.id, question]));
  const answers: AttemptAnswer[] = input.answers.map((given) => {
    const question = byId.get(given.question);
    if (!question) throw new Error(`the quiz has no question ${given.question}; it may have changed while you were taking it`);
    const problems = questionProblems(question);
    if (problems.length > 0) throw new Error(`question ${given.question} cannot be asked: ${problems[0]}`);
    const response = (given.response ?? given.chosen) as Response;
    const problem = responseProblem(question, response);
    if (problem) throw new Error(problem);
    const right = isRight(question, response);
    let earned: number | null = right ? question.points : 0;
    const answer: AttemptAnswer = { question: { ...question }, response, earned };
    if (typeof response === 'number') answer.chosen = response;
    if (right === null) {
      if (input.kind === 'practice') {
        const self = given.self_marked === true;
        answer.self_marked = self;
        earned = self ? question.points : 0;
      } else earned = null;
      answer.earned = earned;
    }
    return answer;
  });
  if (answers.length === 0) throw new Error('an attempt answers at least one question');
  if (input.kind === 'official') {
    const asked = new Set(answers.map((answer) => answer.question.id));
    if (askable(input.quiz).some((question) => !asked.has(question.id))) throw new Error('an official attempt answers the whole quiz');
  }
  const attempt: Attempt = {
    id: input.id,
    quiz: input.quiz.id,
    quiz_title: input.quiz.title,
    kind: input.kind,
    mode: input.mode,
    by: input.by,
    completed_at: input.completedAt,
    score: 0,
    total: 0,
    answers,
  };
  return withTotals(attempt);
}

export function withTotals(attempt: Attempt): Attempt {
  attempt.score = attempt.answers.reduce((sum, answer) => sum + (answer.earned ?? 0), 0);
  attempt.total = attempt.answers.reduce((sum, answer) => sum + answer.question.points, 0);
  attempt.waiting = attempt.answers.filter((answer) => answer.earned === null).length;
  return attempt;
}

// ---- grades ---------------------------------------------------------------------------

export function parseGrade(source: string): Grade {
  const data = parseYaml(source) as Grade;
  if (!data || typeof data !== 'object' || !data.id || !data.attempt || !data.question || typeof data.points !== 'number') throw new Error('it is not a grade');
  return { ...data, note: data.note ?? '', ai: data.ai === true, suggestion: data.suggestion === true };
}

export function renderGrade(grade: Grade): string {
  return stringifyYaml(grade, { lineWidth: 0 });
}

const mark = (grade: Grade): GradeMark => ({ points: grade.points, note: grade.note, by: grade.by, ai: grade.ai, at: grade.at });

// An attempt as its grades leave it: each written answer earns its latest accepted grade, and
// shows the latest suggestion made after it (Academy REQ63, REQ66, REQ67).
export function applyGrades(attempt: Attempt, grades: Grade[]): Attempt {
  const mine = grades.filter((grade) => grade.attempt === attempt.id).sort((a, b) => a.at.localeCompare(b.at));
  const answers = attempt.answers.map((answer) => {
    if (answer.question.type !== 'written' || attempt.kind !== 'official') return answer;
    const forIt = mine.filter((grade) => grade.question === answer.question.id);
    const accepted = forIt.filter((grade) => !grade.suggestion).at(-1);
    const suggested = forIt.filter((grade) => grade.suggestion && (!accepted || grade.at > accepted.at)).at(-1);
    const next: AttemptAnswer = { ...answer, earned: accepted ? Math.min(accepted.points, answer.question.points) : null };
    if (accepted) next.grade = mark(accepted);
    else delete next.grade;
    if (suggested) next.suggestion = mark(suggested);
    else delete next.suggestion;
    return next;
  });
  return withTotals({ ...attempt, answers });
}

// An attempt that counts in a best, an average, a comparison, or a course's progress: nothing
// in it waits for a grade (Academy REQ63).
export const settled = (attempt: Attempt): boolean => (attempt.waiting ?? 0) === 0;

export interface WaitingAnswer {
  attempt: string;
  person: string;
  question: Question;
  response: string;
  completed_at: string;
  earned: number | null;
  grade: GradeMark | null;
  suggestion: GradeMark | null;
}

// Every written answer of a quiz's official attempts, oldest first: those waiting, and those graded.
export function writtenAnswers(official: Attempt[]): WaitingAnswer[] {
  const out: WaitingAnswer[] = [];
  for (const attempt of [...official].sort((a, b) => a.completed_at.localeCompare(b.completed_at))) {
    for (const answer of attempt.answers) {
      if (answer.question.type !== 'written') continue;
      out.push({
        attempt: attempt.id,
        person: attempt.by,
        question: answer.question,
        response: typeof answer.response === 'string' ? answer.response : '',
        completed_at: attempt.completed_at,
        earned: answer.earned,
        grade: answer.grade ?? null,
        suggestion: answer.suggestion ?? null,
      });
    }
  }
  return out;
}

// ---- the sums --------------------------------------------------------------------------

const byTime = (a: Attempt, b: Attempt): number => a.completed_at.localeCompare(b.completed_at);
export const percent = (attempt: { score: number; total: number }): number => (attempt.total === 0 ? 0 : attempt.score / attempt.total);

// The questions of a quiz a person last missed and has not yet seen. The most recent
// answer to each question decides, whichever kind of attempt gave it.
export function practiceSets(quiz: Quiz, attempts: Attempt[]): { missed: string[]; unseen: string[] } {
  const latest = new Map<string, boolean>();
  for (const attempt of [...attempts].sort(byTime)) {
    for (const answer of attempt.answers) if (answer.earned !== null) latest.set(answer.question.id, answer.earned >= answer.question.points);
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
  history: Array<{ id: string; kind: AttemptKind; mode: AttemptMode; score: number; total: number; percent: number; completed_at: string; waiting: number }>;
}

export function myScores(attempts: Attempt[]): MyScores {
  const sorted = [...attempts].sort(byTime);
  const official = sorted.filter((attempt) => attempt.kind === 'official' && settled(attempt));
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
    history: sorted.reverse().map((attempt) => ({
      id: attempt.id,
      kind: attempt.kind,
      mode: attempt.mode,
      score: attempt.score,
      total: attempt.total,
      percent: percent(attempt),
      completed_at: attempt.completed_at,
      waiting: attempt.waiting ?? 0,
    })),
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
export function compare(allOfficial: Attempt[], me: string | null): Comparison {
  const official = allOfficial.filter(settled);
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

export function everyone(allOfficial: Attempt[]): PersonResult[] {
  const official = allOfficial.filter(settled);
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
  // an official attempt with an answer still waiting for a grade
  waiting: boolean;
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

// A quiz's place is its place in the course among quizzes and decks; without one, its place among the quizzes.
export function courseProgress(quizzes: Array<Pick<Quiz, 'id' | 'title' | 'status'> & { place?: number }>, official: Attempt[], alias: string): CourseProgress {
  const rows = quizzes.map((quiz, index) => {
    const theirs = official.filter((attempt) => attempt.quiz === quiz.id && attempt.by === alias);
    const result = everyone(theirs)[0];
    return {
      id: quiz.id,
      title: quiz.title,
      place: quiz.place ?? index + 1,
      status: quiz.status,
      attempts: result?.attempts ?? 0,
      latest: result?.latest ?? null,
      best: result?.best ?? null,
      waiting: theirs.some((attempt) => !settled(attempt)),
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
