// What a question is and the pure work on answering one: its seven types (Academy REQ59),
// what is wrong with it, whether an answer is right, and its answer in words. Nothing here
// needs Node, so the page draws questions with the same rules the commands keep.

// The seven kinds of question (Academy REQ59), each with the answer it takes.
export type QuestionType = 'choice' | 'truefalse' | 'all' | 'short' | 'order' | 'match' | 'written';
export const QUESTION_TYPES: readonly QuestionType[] = ['choice', 'truefalse', 'all', 'short', 'order', 'match', 'written'];
export const QUESTION_TYPE_NAMES: Record<QuestionType, string> = {
  choice: 'Multiple choice',
  truefalse: 'True or false',
  all: 'Check all that are true',
  short: 'Short answer',
  order: 'Put in order',
  match: 'Match',
  written: 'Written answer',
};
export const TRUE_FALSE = ['True', 'False'] as const;

export interface Pair {
  left: string;
  right: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  // shown under the prompt while the question is answered: a passage, a hint, or more about it
  context: string;
  // an asset's path, or empty
  image: string;
  points: number;
  // multiple choice, true or false, and check all that are true
  options: string[];
  // the first right option, null while none is marked; the one right option of multiple choice and true or false
  answer: number | null;
  // every right option; check all that are true takes several
  correct: number[];
  // short answer
  accepted: string[];
  // put in order, in their right order
  items: string[];
  // match
  pairs: Pair[];
  // written answer
  model: string;
  covers: string;
  why: string;
  // a blueprint id, with one of its sections after # or not, an asset's path, a link, or older free text
  reference: string;
}

export function blankQuestion(id: string, type: QuestionType = 'choice'): Question {
  return {
    id,
    type,
    prompt: '',
    context: '',
    image: '',
    points: 1,
    options: type === 'truefalse' ? [...TRUE_FALSE] : type === 'choice' || type === 'all' ? ['', ''] : [],
    answer: null,
    correct: [],
    accepted: type === 'short' ? [''] : [],
    items: type === 'order' ? ['', ''] : [],
    pairs:
      type === 'match'
        ? [
            { left: '', right: '' },
            { left: '', right: '' },
          ]
        : [],
    model: '',
    covers: '',
    why: '',
    reference: '',
  };
}

// What a person gave: the option picked (multiple choice, true or false), the options
// checked (check all that are true), what they typed (short answer, written answer), the
// items in the order they put them (put in order), or the right side picked for each pair,
// in the pairs' order (match).
export type Response = number | number[] | string | string[];

export const TYPE_WORDS: Record<QuestionType, string> = {
  choice: 'multiple choice',
  truefalse: 'true or false',
  all: 'check all that are true',
  short: 'short answer',
  order: 'put in order',
  match: 'match',
  written: 'written answer',
};

export function typeFromWords(words: string): QuestionType | null {
  const wanted = words.trim().toLowerCase().replace(/[_-]+/g, ' ');
  for (const type of QUESTION_TYPES) {
    if (type === wanted || TYPE_WORDS[type] === wanted || QUESTION_TYPE_NAMES[type].toLowerCase() === wanted) return type;
  }
  if (wanted === 'check all') return 'all';
  if (wanted === 'order') return 'order';
  if (wanted === 'written') return 'written';
  if (wanted === 'short') return 'short';
  return null;
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

// What is wrong with a question, in words a person acts on; empty when it can be asked.
export function questionProblems(question: Question): string[] {
  const problems: string[] = [];
  if (!question.prompt.trim()) problems.push('it has no prompt');
  if (!Number.isInteger(question.points) || question.points < 1) problems.push('its points are not a whole number from 1');
  const between = (count: number, word: string, low: number, high: number): void => {
    if (count < low || count > high) problems.push(`it has ${plural(count, word)}, and ${TYPE_WORDS[question.type]} takes ${low} to ${high}`);
  };
  switch (question.type) {
    case 'choice':
      between(question.options.length, 'option', 2, 5);
      if (question.options.some((option) => !option.trim())) problems.push('one of its options is empty');
      if (question.correct.length === 0) problems.push('none of its options is marked as the answer');
      else if (question.correct.length > 1) problems.push('more than one option is marked as the answer; check all that are true takes several');
      break;
    case 'truefalse':
      if (question.options.length !== 2 || question.options[0] !== TRUE_FALSE[0] || question.options[1] !== TRUE_FALSE[1]) problems.push('its options are not True and False');
      if (question.correct.length !== 1) problems.push('neither True nor False is marked as the answer');
      break;
    case 'all':
      between(question.options.length, 'option', 2, 8);
      if (question.options.some((option) => !option.trim())) problems.push('one of its options is empty');
      if (question.correct.length === 0) problems.push('none of its options is marked true');
      break;
    case 'short':
      if (question.accepted.filter((answer) => answer.trim()).length === 0) problems.push('it has no accepted answer');
      break;
    case 'order':
      between(question.items.length, 'item', 2, 8);
      if (question.items.some((item) => !item.trim())) problems.push('one of its items is empty');
      break;
    case 'match': {
      between(question.pairs.length, 'pair', 2, 8);
      if (question.pairs.some((pair) => !pair.left.trim() || !pair.right.trim())) problems.push('one of its pairs is missing a side');
      const rights = question.pairs.map((pair) => normalized(pair.right));
      if (new Set(rights).size !== rights.length) problems.push('two of its pairs have the same right side');
      break;
    }
    case 'written':
      if (!question.model.trim()) problems.push('it has no model answer');
      break;
  }
  return problems;
}

// A question as it is kept: every list there, True and False for a true or false question,
// and the one right option of multiple choice and true or false held in both places.
export function normalizeQuestion(question: Partial<Question> & { id: string }): Question {
  const type = question.type ?? 'choice';
  const base = blankQuestion(question.id, type);
  const next: Question = { ...base, ...question, type };
  for (const key of ['options', 'correct', 'accepted', 'items', 'pairs'] as const) if (!Array.isArray(next[key])) (next as unknown as Record<string, unknown>)[key] = base[key];
  if (type === 'truefalse') next.options = [...TRUE_FALSE];
  if ((type === 'choice' || type === 'truefalse') && next.correct.length === 0 && typeof question.answer === 'number') next.correct = [question.answer];
  if (type === 'choice' || type === 'truefalse') next.correct = next.correct.slice(0, 1);
  next.correct = [...new Set(next.correct)].filter((index) => index >= 0 && index < next.options.length).sort((a, b) => a - b);
  next.answer = next.correct[0] ?? null;
  next.points = Number.isInteger(next.points) && next.points > 0 ? next.points : 1;
  for (const key of ['prompt', 'context', 'image', 'model', 'covers', 'why', 'reference'] as const) if (typeof next[key] !== 'string') next[key] = '';
  return next;
}

// ---- answering a question --------------------------------------------------------------

// What a short answer is compared as: no capitals, one space between words, and no
// punctuation or space at either end (Academy REQ60).
export function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '');
}

// Right, wrong, or null for a written answer, which only a grade decides.
export function isRight(question: Question, response: Response): boolean | null {
  switch (question.type) {
    case 'choice':
    case 'truefalse':
      return typeof response === 'number' && response === question.answer;
    case 'all': {
      if (!Array.isArray(response)) return false;
      const given = new Set(response as number[]);
      return given.size === question.correct.length && question.correct.every((index) => given.has(index));
    }
    case 'short':
      return typeof response === 'string' && question.accepted.some((answer) => normalized(answer) === normalized(response) && normalized(answer) !== '');
    case 'order':
      return Array.isArray(response) && response.length === question.items.length && question.items.every((item, index) => response[index] === item);
    case 'match':
      return Array.isArray(response) && response.length === question.pairs.length && question.pairs.every((pair, index) => response[index] === pair.right);
    case 'written':
      return null;
  }
}

// Whether a response is the right shape for its question, so a page or a command that sends
// the wrong thing is told so rather than scored.
export function responseProblem(question: Question, response: unknown): string | null {
  switch (question.type) {
    case 'choice':
    case 'truefalse':
      return Number.isInteger(response) && (response as number) >= 0 && (response as number) < question.options.length ? null : `question ${question.id} has no option ${String(response)}`;
    case 'all':
      return Array.isArray(response) && response.every((index) => Number.isInteger(index) && index >= 0 && index < question.options.length)
        ? null
        : `question ${question.id} takes the options checked`;
    case 'short':
    case 'written':
      return typeof response === 'string' ? null : `question ${question.id} takes what was typed`;
    case 'order':
      return Array.isArray(response) && response.length === question.items.length && [...response].sort().join('\n') === [...question.items].sort().join('\n')
        ? null
        : `question ${question.id} takes its items in an order`;
    case 'match':
      return Array.isArray(response) && response.length === question.pairs.length && response.every((right) => typeof right === 'string')
        ? null
        : `question ${question.id} takes one right side for each pair`;
  }
}

// The right answer in words, for a review, a result, or the back of a card.
export function answerText(question: Question): string {
  switch (question.type) {
    case 'choice':
    case 'truefalse':
      return question.answer === null ? '' : (question.options[question.answer] ?? '').trim();
    case 'all':
      return question.correct.map((index) => question.options[index]!.trim()).join('; ');
    case 'short':
      return question.accepted
        .map((answer) => answer.trim())
        .filter(Boolean)
        .join(', ');
    case 'order':
      return question.items.map((item) => item.trim()).join(', ');
    case 'match':
      return question.pairs.map((pair) => `${pair.left.trim()}: ${pair.right.trim()}`).join('; ');
    case 'written':
      return question.model.trim();
  }
}

// What a person gave, in words.
export function responseText(question: Question, response: Response): string {
  switch (question.type) {
    case 'choice':
    case 'truefalse':
      return typeof response === 'number' ? (question.options[response] ?? '') : '';
    case 'all':
      return Array.isArray(response) && response.length > 0 ? (response as number[]).map((index) => question.options[index] ?? '').join('; ') : 'nothing checked';
    case 'short':
    case 'written':
      return typeof response === 'string' ? response : '';
    case 'order':
      return Array.isArray(response) ? (response as string[]).join(', ') : '';
    case 'match':
      return Array.isArray(response) ? question.pairs.map((pair, index) => `${pair.left}: ${String((response as string[])[index] ?? '')}`).join('; ') : '';
  }
}

// What a reference names: a blueprint (and one of its sections), an asset, a link, or text.
export type ReferenceLink = { kind: 'blueprint'; id: string; section: string | null } | { kind: 'asset'; path: string } | { kind: 'link'; url: string } | { kind: 'text'; text: string };

export function referenceLink(reference: string): ReferenceLink | null {
  const value = reference.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return { kind: 'link', url: value };
  if (/^assets\//.test(value)) return { kind: 'asset', path: value };
  const blueprint = /^@?([A-Z]{1,3}-[A-Z0-9]{2,8})(?:#(.+))?$/.exec(value);
  if (blueprint) return { kind: 'blueprint', id: blueprint[1]!, section: blueprint[2]?.trim() || null };
  return { kind: 'text', text: value };
}
