// A quiz taken from a public link (Academy REQ68 to REQ75, Plugin Share Links): what a guest is handed, the guest copy,
// which holds every question as it is asked and no answer; and the key Eidos checks each answer against and never sends. Both
// are files in the plugin's workspace, rewritten as the quiz changes, so an open link follows it. Nothing here needs Node, so
// guest.js reads the same shapes it is drawn from.
import { answerText, blankQuestion, isRight, type Question, type QuestionType, referenceLink, type Response } from './question.ts';
import { withTotals, type Attempt, type AttemptAnswer, type GuestName, type Quiz } from './model.ts';

export const GUEST_FOLDER = 'guest';
export const KEY_FOLDER = 'keys';

// A question as a guest is asked it: put in order's items and match's right sides in an order that gives nothing away.
export interface GuestQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  context: string;
  // the project's own image, by its root-relative path, which Eidos serves to the frame; empty for none
  image: string;
  points: number;
  options: string[];
  items: string[];
  lefts: string[];
  rights: string[];
}

export interface GuestCopy {
  academy: 1;
  quiz: string;
  title: string;
  course: string | null;
  guest_name: GuestName;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  questions: GuestQuestion[];
}

// What the key lets a guest's page show once a question is answered (D-S26).
export interface Shown {
  right: string;
  why: string;
  reference: { text: string } | { url: string } | null;
  model?: string;
  covers?: string;
  // the right answer in the shape the page marks it on, so each option, item, or pair shows whether it was right: the
  // options checked for check all that are true (by their index as written), the items in their order, and the right side
  // for each left in turn; absent from a key written before Academy 0.5.1, and for the types that need none
  key?: number[] | string[];
}

// A guest's attempt, as guest.js sends it: the quiz, the name given, and an answer by question id, in the shapes
// isRight takes (an option's index as written, the indices checked, the words typed, the items in order, a right side per left).
export interface GuestAttempt {
  quiz: string;
  name: string | null;
  answers: Record<string, Response>;
}

// A steady shuffle: the same quiz always gives the same order, and never the right one where there are two or more.
function scrambled(values: string[], seed: string): string[] {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const next = (): number => {
    state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0;
    state = Math.imul(state ^ (state >>> 13), 3266489909) >>> 0;
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
  const out = [...values];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(next() * (index + 1));
    [out[index], out[other]] = [out[other]!, out[index]!];
  }
  if (out.length > 1 && out.every((value, index) => value === values[index])) out.push(out.shift()!);
  return out;
}

export function guestQuestion(question: Question): GuestQuestion {
  const choices = question.type === 'choice' || question.type === 'truefalse' || question.type === 'all';
  return {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    context: question.context,
    image: /^assets\//.test(question.image) ? question.image : '',
    points: question.points,
    options: choices ? [...question.options] : [],
    items: question.type === 'order' ? scrambled(question.items, question.id) : [],
    lefts: question.type === 'match' ? question.pairs.map((pair) => pair.left) : [],
    rights:
      question.type === 'match'
        ? scrambled(
            question.pairs.map((pair) => pair.right),
            question.id,
          )
        : [],
  };
}

export function guestCopy(quiz: Quiz, askable: Question[], course: string | null): GuestCopy {
  return {
    academy: 1,
    quiz: quiz.id,
    title: quiz.title,
    course,
    guest_name: quiz.guest_name,
    shuffle_questions: quiz.shuffle_questions,
    shuffle_options: quiz.shuffle_options,
    questions: askable.map(guestQuestion),
  };
}

// A reference as a guest reads it: a blueprint's title and section, an asset's name, or a web link, since a guest cannot
// open the project (REQ69).
export function guestReference(reference: string, titleOf: (id: string) => string | null): Shown['reference'] {
  const link = referenceLink(reference);
  if (!link) return null;
  if (link.kind === 'link') return { url: link.url };
  if (link.kind === 'asset') return { text: link.path.split('/').pop() ?? link.path };
  if (link.kind === 'blueprint') {
    const title = titleOf(link.id) ?? link.id;
    return { text: link.section ? `${title} › ${link.section}` : title };
  }
  return { text: link.text };
}

function compared(question: Question): { compare: string; answer: unknown } | null {
  switch (question.type) {
    case 'choice':
    case 'truefalse':
      return { compare: 'choice', answer: question.answer };
    case 'all':
      return { compare: 'set', answer: question.correct };
    case 'short':
      return { compare: 'text', answer: question.accepted };
    case 'order':
      return { compare: 'order', answer: question.items };
    case 'match':
      return { compare: 'pairs', answer: question.pairs.map((pair) => pair.right) };
    case 'written':
      return null;
  }
}

function markedKey(question: Question): Shown['key'] | null {
  if (question.type === 'all') return [...question.correct].sort((a, b) => a - b);
  if (question.type === 'order') return [...question.items];
  if (question.type === 'match') return question.pairs.map((pair) => pair.right);
  return null;
}

// The key Eidos scores with (Plugin Share Links REQ20): each question's answer, how it is compared, its points, and what may
// be shown once it is answered. A written answer has no answer to compare, so Eidos keeps it for a grader.
export function shareKey(askable: Question[], titleOf: (id: string) => string | null): { questions: Record<string, Record<string, unknown>> } {
  const questions: Record<string, Record<string, unknown>> = {};
  for (const question of askable) {
    const shown: Shown = { right: answerText(question), why: question.why, reference: guestReference(question.reference, titleOf) };
    if (question.type === 'written') {
      shown.model = question.model;
      shown.covers = question.covers;
    }
    const key = markedKey(question);
    if (key) shown.key = key;
    questions[question.id] = { ...(compared(question) ?? {}), points: question.points, shown };
  }
  return { questions };
}

// What a guest sent, as Academy reads it from a submission's data: null where it is not an attempt at this quiz.
export function guestAttemptOf(data: unknown, quiz: string): GuestAttempt | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const held = data as Record<string, unknown>;
  if (held['quiz'] !== quiz) return null;
  const answers = held['answers'];
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) return null;
  const name = typeof held['name'] === 'string' && held['name'].trim() !== '' ? held['name'].trim().slice(0, 120) : null;
  return { quiz, name, answers: answers as Record<string, Response> };
}

// The id a guest's attempt goes by in Academy, and in a grade of its written answer (REQ74): the submission Eidos kept it as.
export const GUEST_ATTEMPT = 'guest:';
export const guestAttemptId = (link: string, id: string): string => `${GUEST_ATTEMPT}${link}/${id}`;

// A guest's submission as an attempt at the quiz, scored as Eidos scored it where it did, and by the same rules where not. Each
// answer is drawn against the question as the quiz holds it now; one since deleted shows as removed (REQ72).
export function guestAttempt(submission: { link: string; id: string; arrived: string; data: unknown; score?: { answers: Readonly<Record<string, boolean | null>> } }, quiz: Quiz): Attempt | null {
  const held = guestAttemptOf(submission.data, quiz.id);
  if (!held) return null;
  const answers: AttemptAnswer[] = Object.entries(held.answers).map(([id, response]) => {
    const question = quiz.questions.find((each) => each.id === id) ?? { ...blankQuestion(id, 'short'), prompt: 'A question since removed from the quiz', points: 0 };
    const said = submission.score?.answers[id];
    const right = said !== undefined ? said : isRight(question, response);
    return { question, response, earned: question.type === 'written' ? null : right ? question.points : 0 };
  });
  return withTotals({
    id: guestAttemptId(submission.link, submission.id),
    quiz: quiz.id,
    quiz_title: quiz.title,
    kind: 'official',
    mode: 'whole',
    by: 'guest',
    completed_at: submission.arrived,
    score: 0,
    total: 0,
    answers,
    guest: { name: held.name, link: submission.link, submission: submission.id },
  });
}
