// Academy's page half: its activity in the Primary Sidebar, the list and its filters, a
// course, a quiz and its tabs, taking a quiz, a deck and its tabs, studying it, Keep studying,
// the builders, the view beside a blueprint, and the slash commands that bring in the person's
// own agent.
import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Empty,
  Input,
  Modal,
  Nav,
  NavGroup,
  NavHead,
  NavCount,
  NavLink,
  Notice,
  Page,
  PageHead,
  PageTitle,
  Row,
  Seg,
  SegItem,
  Select,
  SkeletonBar,
  Stack,
  Text,
  Textarea,
  useOpen,
  usePluginHost,
  type AgentPageApi,
  type PagePlugin,
  type PluginHost,
} from 'eidosmd/page';
import { asPercent, ContextMenu, Delta, DraftActions, DraftNotice, Failed, formatDate, HelpMark, KIT_DRAFTS, LaptopMark, Loading, Stat, Surface, useAct, useData, useDraft, UserPill, useTrail, type MenuEntry } from './page-kit.tsx';
import type { Attempt, AttemptKind, GuestName, AttemptMode, Card, Comparison, Course, CourseProgress, Deck, DeckProgress, GradeMark, MyScores, PersonResult, Quiz, StudyMode } from './model.ts';
import { dragRow } from './drag.ts';
import { PAGE_STRINGS } from './page-strings.ts';
import { answerText, blankQuestion, isRight, QUESTION_TYPE_NAMES, QUESTION_TYPES, referenceLink, responseText, TRUE_FALSE, type Question, type QuestionType, type Response } from './question.ts';

// ---- what the routes answer ------------------------------------------------------------

interface Row_ {
  id: string;
  title: string;
  path: string;
  course: string | null;
  course_title: string | null;
  place: number | null;
  draws_from: string[];
  questions: number;
  created_by: string | null;
  created_by_name: string | null;
  status: 'open' | 'closed';
  best: number | null;
  waiting: boolean;
  may_edit: boolean;
  may_manage: boolean;
  // kept just for the person, on this machine (Academy REQ76)
  local: boolean;
}
interface DeckRow_ {
  id: string;
  title: string;
  path: string;
  course: string | null;
  course_title: string | null;
  place: number | null;
  draws_from: string[];
  cards: number;
  created_by: string | null;
  created_by_name: string | null;
  status: 'open' | 'closed';
  learned: number;
  learning: number;
  unseen: number;
  last_studied: string | null;
  may_edit: boolean;
  may_manage: boolean;
  local: boolean;
}
interface Overview {
  me: { name: string; alias: string | null; owner: boolean } | null;
  folder: string;
  quizzes: Row_[];
  decks: DeckRow_[];
  quizzes_left: { folder: string | null; quizzes: number; results: number; may_move: boolean } | null;
  courses: Array<{ id: string; title: string; created_by: string | null; enrolled: boolean; may_edit: boolean; local: boolean }>;
}
interface QuizView {
  quiz: Quiz;
  created_by_name: string | null;
  proctor_names: Record<string, string | null>;
  askable: number;
  course: { id: string; title: string } | null;
  place: number | null;
  of: number;
  may: { edit: boolean; manage: boolean; results: boolean; take_official: boolean; official_why: string | null; keep: boolean; keep_why: string | null };
  scores: MyScores;
  practice: { missed: string[]; unseen: string[] };
  whole_quiz: string[];
  references: Array<{ id: string; title: string; rel: string; sections: string[] }>;
  to_grade: number | null;
  // guests' attempts from the quiz's public links; null to anyone who may not see them (Academy REQ72)
  guests: number | null;
  people: Array<{ alias: string; name: string }>;
}
interface Pickable {
  blueprints: Array<{ id: string; title: string; rel?: string }>;
  groups: string[];
}
interface CourseView {
  course: Course;
  created_by_name: string | null;
  may: { edit: boolean; people: boolean; enroll: boolean; enroll_why: string | null; keep: boolean; keep_why: string | null };
  enrolled_since: string | null;
  enrolled_people: number;
  people: Array<{ alias: string; name: string }>;
  quizzes: Row_[];
  decks: DeckRow_[];
  items: Array<{ kind: 'quiz'; row: Row_ } | { kind: 'deck'; row: DeckRow_ }>;
  progress: { taken: number; of: number; average_best: number | null; cards_learned: number; cards_learning: number; cards: number; sessions_done: number; sessions: number };
  content: Array<{ id: string; title: string; rel: string }>;
  sessions: Array<{ id: string; title: string; rel: string; done: boolean }>;
}
interface ProgressView {
  person: { alias: string; name: string };
  mine: boolean;
  // null for a local course, which follows the person without enrolling
  enrolled_since: string | null;
  progress: CourseProgress;
  sessions_done: number;
  sessions: number;
}
interface RosterView {
  people: Array<{ alias: string; name: string; since: string; taken: number; of: number; average_best: number | null; last_taken: string | null; sessions_done: number; sessions: number }>;
  average_best: number | null;
}
interface Submitted {
  attempt: Attempt;
  percent: number;
  first: boolean;
  new_best: boolean;
  change: number | null;
  official_attempts: number;
  average: number | null;
  practice: { missed: string[]; unseen: string[] };
  waiting: number;
}
interface ResultsView {
  summary: Comparison;
  attempts: number;
  first: string | null;
  people: Array<PersonResult & { name: string }>;
}

interface Standing {
  id: string;
  state: 'new' | 'learning' | 'learned';
  last_seen: string | null;
  last_got: boolean | null;
}
interface DeckView {
  deck: Deck;
  created_by_name: string | null;
  proctor_names: Record<string, string | null>;
  studiable: number;
  course: { id: string; title: string } | null;
  place: number | null;
  of: number;
  made_from: { id: string; title: string | null } | null;
  may: { edit: boolean; manage: boolean; study: boolean; shared: boolean; keep: boolean; keep_why: string | null };
  progress: DeckProgress;
  missed_last: number;
  standings: Record<string, Standing>;
  quizzes: Array<{ id: string; title: string; questions: number }>;
  people: Array<{ alias: string; name: string }>;
}
interface StudyView {
  title: string;
  deck: string | null;
  mode: StudyMode;
  cards: Array<{ deck: string; deck_title: string; card: Card; state: Standing['state'] }>;
}
interface Studied {
  shared: boolean;
  cards: number;
  got: number;
  still_learning: number;
  minutes: number;
  decks: Array<{ deck: string; title: string; learned: number; gained: number; of: number; left: number }>;
  missed: Array<{ deck: string; front: string; back: string }>;
}
interface KeepView {
  decks: DeckRow_[];
  learned: number;
  learning: number;
  unseen: number;
  cards: number;
  may_study: boolean;
}

const Q = (value: string): string => encodeURIComponent(value);

// True and False stay as the quiz's file has them; the page says them in the person's language.
function trueFalseWord(t: PluginHost['t'], option: string): string {
  return option === TRUE_FALSE[0] ? t('true') : option === TRUE_FALSE[1] ? t('false') : option;
}

// The catalog's key for each question type's name; QUESTION_TYPE_NAMES stays the English the commands read and write.
const TYPE_NAME_KEYS: Record<QuestionType, string> = {
  choice: 'typeChoice',
  truefalse: 'typeTrueFalse',
  all: 'typeAll',
  short: 'typeShort',
  order: 'typeOrder',
  match: 'typeMatch',
  written: 'typeWritten',
};

// A question's answer and what someone gave, as the page says them.
function answerWords(t: PluginHost['t'], question: Question): string {
  return question.type === 'truefalse' ? trueFalseWord(t, answerText(question)) : answerText(question);
}

function responseWords(t: PluginHost['t'], question: Question, response: Response): string {
  if (question.type === 'truefalse') return trueFalseWord(t, responseText(question, response));
  if (question.type === 'all' && !(Array.isArray(response) && response.length > 0)) return t('nothingChecked');
  return responseText(question, response);
}

function pageHref(host: PluginHost, path: string): string {
  return host.hrefs.page(path);
}

function Link({ to, className, children, ...rest }: { to: string; className?: string; children: ReactNode; [key: string]: unknown }): JSX.Element {
  const host = usePluginHost();
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        host.navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

// ---- kept just for the person, and shared with the project (Academy REQ76, REQ80) ----

type Act = (title: string, work: () => Promise<unknown>) => Promise<boolean>;

// Shares a quiz, a deck, or a course kept just for the person with the project, once they agree.
async function shareWithProject(host: PluginHost, act: Act, thing: { kind: 'quiz' | 'deck' | 'course'; id: string; title: string; course?: string | null; holds?: number }): Promise<boolean> {
  const { t } = host;
  const holds = thing.holds ?? 0;
  const words =
    thing.kind === 'course'
      ? t(holds === 1 ? 'shareCourseAskOne' : 'shareCourseAsk', { title: thing.title, n: holds })
      : thing.kind === 'quiz'
        ? t(thing.course ? 'shareQuizInCourseAsk' : 'shareQuizAsk', { title: thing.title, course: thing.course ?? '' })
        : t(thing.course ? 'shareDeckInCourseAsk' : 'shareDeckAsk', { title: thing.title, course: thing.course ?? '' });
  if (!(await host.dialog.confirm(`${words} ${t('shareAgain')}`, { title: t('shareWithProject'), ok: t('shareWithProject') }))) return false;
  const failed = thing.kind === 'course' ? t('shareCourseFailed') : thing.kind === 'quiz' ? t('shareQuizFailed') : t('shareDeckFailed');
  return act(failed, () => host.post(`share-with-project?id=${Q(thing.id)}`));
}

// Keeps a shared quiz, deck, or course just for the person again; the server says why not when someone's history is with it.
async function keepJustForMe(host: PluginHost, act: Act, thing: { kind: 'quiz' | 'deck' | 'course'; id: string; title: string }): Promise<boolean> {
  const { t } = host;
  const words = t('keepAsk', { title: thing.title });
  if (!(await host.dialog.confirm(words, { title: t('keepJustForMe'), ok: t('keepJustForMe') }))) return false;
  const failed = thing.kind === 'course' ? t('keepCourseFailed') : thing.kind === 'quiz' ? t('keepQuizFailed') : t('keepDeckFailed');
  return act(failed, () => host.post(`keep-just-for-me?id=${Q(thing.id)}`));
}

// A page header's ⋯: what a quiz, a deck, or a course offers beyond its buttons, opened under it.
function HeadMenu({ items }: { items: MenuEntry[] }): JSX.Element | null {
  const { t } = usePluginHost();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  if (items.length === 0) return null;
  return (
    <>
      <Button
        size="sm"
        aria-label={t('more')}
        title={t('more')}
        onClick={(event: { currentTarget: HTMLElement }) => {
          const box = event.currentTarget.getBoundingClientRect();
          setAt({ x: box.right - 240, y: box.bottom + 4 });
        }}
      >
        ⋯
      </Button>
      {at && <ContextMenu x={at.x} y={at.y} items={items} onClose={() => setAt(null)} />}
    </>
  );
}

// The chip above a local quiz's, deck's, or course's name, saying where it lives (Academy REQ81).
function LocalChip(): JSX.Element {
  const { t } = usePluginHost();
  return (
    <span className="qz-eyebrow qz-chip-local">
      <LaptopMark /> {t('localChip')}
    </span>
  );
}

// The laptop beside something kept just for the person, wherever it is listed (Academy REQ81).
function LocalMark(): JSX.Element {
  const { t } = usePluginHost();
  return (
    <span className="qz-local-mark" title={t('localMarkTitle')}>
      <LaptopMark />
    </span>
  );
}

function agentOf(host: PluginHost): AgentPageApi | undefined {
  return host.plugin<AgentPageApi>('agent');
}

// The agent's button where it is there; with no AI Agent, a line saying the builder works by hand.
function Ask({ label, title, text }: { label: string; title: string; text: string }): JSX.Element {
  const host = usePluginHost();
  const agent = agentOf(host);
  if (!agent)
    return (
      <Button disabled size="sm" variant="accent" title={host.t('noAgentTitle')}>
        {label}
      </Button>
    );
  const AskAgent = agent.AskAgent;
  return <AskAgent label={label} title={title} text={text} />;
}

// The agent's button in a modal: pressing it closes the modal, so the conversation it opens in Chat is not left behind a
// scrim. The press has already started the conversation by the time the click reaches here.
function AskAndClose({ label, title, text, onClose }: { label: string; title: string; text: string; onClose: () => void }): JSX.Element {
  return (
    <span style={{ display: 'contents' }} onClick={onClose}>
      <Ask label={label} title={title} text={text} />
    </span>
  );
}

// Generating with questions or cards already there asks first, since the agent adds to them.
function Generate({ label, title, text, existing, noun }: { label: string; title: string; text: string; existing: number; noun: string; what: string }): JSX.Element {
  const { t } = usePluginHost();
  const [asking, setAsking] = useState(false);
  if (existing === 0) return <Ask label={label} title={title} text={text} />;
  return (
    <>
      <Button size="sm" variant="accent" onClick={() => setAsking(true)}>
        {label}
      </Button>
      {asking && (
        <Modal
          title={t('generateAskTitle', { label })}
          onClose={() => setAsking(false)}
          foot={
            <Row justify="end" gap="sm">
              <Button onClick={() => setAsking(false)}>{t('cancel')}</Button>
              <AskAndClose label={label} title={title} text={text} onClose={() => setAsking(false)} />
            </Row>
          }
        >
          <Stack gap="md" pad="md">
            <Text>
              {noun === 'card'
                ? t(existing === 1 ? 'generateAskCardsOne' : 'generateAskCards', { n: existing })
                : t(existing === 1 ? 'generateAskQuestionsOne' : 'generateAskQuestions', { n: existing })}
            </Text>
          </Stack>
        </Modal>
      )}
    </>
  );
}

// ---- the agent's openings -----------------------------------------------------------------

function generateText(quiz: Quiz, count: number, alias: string | null): string {
  return [
    `Generate ${count} questions for the quiz ${quiz.id}, "${quiz.title}". Use multiple choice unless I ask for other types.`,
    quiz.draws_from.length > 0 ? `It draws from: ${quiz.draws_from.join(', ')}. Read all of it, and base every question strictly on it.` : 'It draws from nothing yet, so ask me what it should cover.',
    `Run \`eidos instructions academy\` first and follow what it says about writing questions, then add each one with \`eidos academy question add ${quiz.id}\`.`,
    quiz.closed
      ? 'It is closed, so leave it closed when you finish.'
      : `So nobody starts a half-written quiz, first run \`eidos academy quiz set ${quiz.id} --status closed\`, and after the last question run \`eidos academy quiz set ${quiz.id} --status open\`.`,
    alias ? `You are working for @${alias}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function regenerateText(quiz: Quiz, question: Question): string {
  return [
    `Replace question ${question.id} of the quiz ${quiz.id}, "${quiz.title}", with a better one on the same content (${quiz.draws_from.join(', ') || 'ask me what it covers'}).`,
    `The question now asks: ${question.prompt}`,
    'First ask me what is wrong with it, unless I have said.',
    `It is ${QUESTION_TYPE_NAMES[question.type].toLowerCase()}; keep that type unless I ask for another.`,
    `Run \`eidos instructions academy\` first, then write it with \`eidos academy question set ${quiz.id} ${question.id} --regenerated\`.`,
  ].join(' ');
}

const studyPlanText = (what: string): string =>
  `Build a study plan for ${what}. Run \`eidos instructions academy\` first and follow its section on writing a study plan, and ask me where the sessions should go before you change anything.`;

function generateCardsText(deck: Deck, count: number, alias: string | null): string {
  return [
    `Write ${count} flashcards for the deck ${deck.id}, "${deck.title}".`,
    deck.draws_from.length > 0 ? `It draws from: ${deck.draws_from.join(', ')}. Read all of it, and base every card strictly on it.` : 'It draws from nothing yet, so ask me what it should cover.',
    `Run \`eidos instructions academy\` first and follow what it says about writing cards, then add each one with \`eidos academy card add ${deck.id}\`.`,
    deck.closed
      ? 'It is closed, so leave it closed when you finish.'
      : `So nobody starts a half-written deck, first run \`eidos academy deck set ${deck.id} --status closed\`, and after the last card run \`eidos academy deck set ${deck.id} --status open\`.`,
    alias ? `You are working for @${alias}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function regenerateCardText(deck: Deck, card: Card): string {
  return [
    `Replace card ${card.id} of the deck ${deck.id}, "${deck.title}", with a better one on the same content (${deck.draws_from.join(', ') || 'ask me what it covers'}).`,
    `Its front now reads: ${card.front}`,
    'First ask me what is wrong with it, unless I have said.',
    `Run \`eidos instructions academy\` first, then write it with \`eidos academy card set ${deck.id} ${card.id} --regenerated\`.`,
  ].join(' ');
}

// ---- the activity ----------------------------------------------------------------------------

// What Created by me lists: the quizzes a person made, and the quizzes of the courses they made.
function isMine(row: { created_by: string | null; course: string | null }, overview: Overview): boolean {
  const alias = overview.me?.alias ?? null;
  if (alias === null) return false;
  return row.created_by === alias || overview.courses.some((course) => course.id === row.course && course.created_by === alias);
}

function Sidebar(): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const { data } = useData<Overview>('overview');
  const [making, setMaking] = useState<'quiz' | 'deck' | 'course' | null>(null);
  const alias = data?.me?.alias ?? null;
  const quizzes = data?.quizzes ?? [];
  const decks = data?.decks ?? [];
  const courses = data?.courses ?? [];
  const enrolled = courses.filter((course) => course.enrolled);
  const here = typeof window === 'undefined' ? '' : window.location.pathname + window.location.search;
  const act = useAct();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
  const opens = (items: MenuEntry[]) => (event: { clientX: number; clientY: number; preventDefault: () => void }) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, items });
  };
  const go = (label: string, to: string): MenuEntry => ({ label, run: () => host.navigate(to) });
  const copyId = (id: string): MenuEntry => ({ label: t('copyId'), run: () => void navigator.clipboard?.writeText(id), rule: true });
  const newQuiz: MenuEntry = { label: t('newQuiz'), run: () => setMaking('quiz') };
  const newCourse: MenuEntry = { label: t('newCourse'), run: () => setMaking('course') };
  const newDeck: MenuEntry = { label: t('newDeck'), run: () => setMaking('deck') };
  const rename = (what: 'quiz' | 'deck' | 'course', title: string, route: string): MenuEntry => ({
    label: t('rename'),
    run: async () => {
      const [ask, heading, failed] =
        what === 'quiz'
          ? [t('renameQuizAsk'), t('renameQuizTitle'), t('renameQuizFailed')]
          : what === 'deck'
            ? [t('renameDeckAsk'), t('renameDeckTitle'), t('renameDeckFailed')]
            : [t('renameCourseAsk'), t('renameCourseTitle'), t('renameCourseFailed')];
      const next = await host.dialog.prompt(ask, { title: heading, value: title, ok: t('rename') });
      if (next && next.trim() && next !== title) await act(failed, () => host.put(route, { title: next }));
    },
  });
  // Share with the project on what is just the person's, Keep it just for me on what its holder may take back
  const across = (kind: 'quiz' | 'deck' | 'course', row: { id: string; title: string; local: boolean; course?: string | null }, manage: boolean): MenuEntry[] => {
    if (row.local) {
      const course = row.course ? (courses.find((held) => held.id === row.course)?.title ?? null) : null;
      const holds = kind === 'course' ? quizzes.filter((held) => held.course === row.id).length + decks.filter((held) => held.course === row.id).length : 0;
      return [{ label: t('shareWithProject'), run: () => void shareWithProject(host, act, { kind, id: row.id, title: row.title, course, holds }) }];
    }
    return manage ? [{ label: t('keepJustForMe'), run: () => void keepJustForMe(host, act, { kind, id: row.id, title: row.title }) }] : [];
  };
  const gone = (title: string, local: boolean, stays: string): string => (local ? t('deleteLocalAsk', { title }) : t('deleteAsk', { title, stays }));
  const courseMenu = (course: Overview['courses'][number]): MenuEntry[] => {
    const page = pageHref(host, `course/${Q(course.id)}`);
    return [
      go(t('open'), page),
      ...(course.enrolled || course.local ? [go(t('myProgress'), `${page}/progress`)] : []),
      ...(course.may_edit && !course.local ? [go(t('enrolled'), `${page}/people`)] : []),
      copyId(course.id),
      ...(course.local
        ? []
        : [
            course.enrolled
              ? { label: t('leaveCourse'), run: () => void act(t('leaveCourseFailed'), () => host.del(`course/enroll?id=${Q(course.id)}`)) }
              : { label: t('enroll'), run: () => void act(t('enrollFailed'), () => host.post(`course/enroll?id=${Q(course.id)}`)) },
          ]),
      ...across('course', course, course.may_edit),
      ...(course.may_edit
        ? [
            rename('course', course.title, `course?id=${Q(course.id)}`),
            {
              label: t('delete'),
              danger: true,
              rule: true,
              run: async () => {
                const held = quizzes.filter((row) => row.course === course.id).length;
                const decksIn = decks.filter((row) => row.course === course.id).length;
                const counts = { title: course.title, quizzes: t(held === 1 ? 'quizCountOne' : 'quizCount', { n: held }), decks: t(decksIn === 1 ? 'deckCountOne' : 'deckCount', { n: decksIn }) };
                if (
                  await host.dialog.confirm(t(course.local ? 'deleteLocalCourseAsk' : 'deleteCourseAsk', counts), {
                    title: t('deleteCourse'),
                    ok: t('delete'),
                    danger: true,
                  })
                ) {
                  await act(t('deleteCourseFailed'), () => host.del(`course?id=${Q(course.id)}`));
                }
              },
            },
          ]
        : []),
    ];
  };
  const quizMenu = (row: Row_): MenuEntry[] => {
    const page = pageHref(host, `quiz/${Q(row.id)}`);
    const take = pageHref(host, `take/${Q(row.id)}`);
    const canPractice = row.questions > 0 && (row.status === 'open' || row.may_edit);
    return [
      go(t('open'), page),
      ...(row.local
        ? canPractice
          ? [go(t('takeQuiz'), `${take}?kind=practice&mode=whole`)]
          : []
        : [...(row.status === 'open' ? [go(t('takeOfficially'), `${take}?kind=official&mode=whole`)] : []), ...(canPractice ? [go(t('practice'), `${take}?kind=practice&mode=whole`)] : [])]),
      ...(row.may_edit ? [go(t('questions'), `${page}/questions`)] : []),
      copyId(row.id),
      ...(row.may_edit && row.questions > 0
        ? [
            {
              label: row.status === 'open' ? t('closeQuiz') : t('openQuiz'),
              run: () => void act(t('changeQuizFailed'), () => host.put(`quiz?id=${Q(row.id)}`, { status: row.status === 'open' ? 'closed' : 'open' })),
            },
          ]
        : []),
      ...across('quiz', row, row.may_manage),
      ...(row.may_edit ? [rename('quiz', row.title, `quiz?id=${Q(row.id)}`)] : []),
      ...(row.may_manage
        ? [
            {
              label: t('delete'),
              danger: true,
              rule: true,
              run: async () => {
                if (await host.dialog.confirm(gone(row.title, row.local, t('deleteQuizStays')), { title: t('deleteQuiz'), ok: t('delete'), danger: true })) {
                  await act(t('deleteQuizFailed'), () => host.del(`quiz?id=${Q(row.id)}`));
                }
              },
            },
          ]
        : []),
    ];
  };
  const deckMenu = (row: DeckRow_): MenuEntry[] => {
    const page = pageHref(host, `deck/${Q(row.id)}`);
    return [
      go(t('open'), page),
      ...(row.cards > 0 && (row.status === 'open' || row.may_edit) ? [go(t('study'), `${pageHref(host, 'study')}?deck=${Q(row.id)}`)] : []),
      ...(row.may_edit ? [go(t('cards'), `${page}/cards`)] : []),
      copyId(row.id),
      ...(row.may_edit && row.cards > 0
        ? [
            {
              label: row.status === 'open' ? t('closeDeck') : t('openDeck'),
              run: () => void act(t('changeDeckFailed'), () => host.put(`deck?id=${Q(row.id)}`, { status: row.status === 'open' ? 'closed' : 'open' })),
            },
          ]
        : []),
      ...across('deck', row, row.may_manage),
      ...(row.may_edit ? [rename('deck', row.title, `deck?id=${Q(row.id)}`)] : []),
      ...(row.may_manage
        ? [
            {
              label: t('delete'),
              danger: true,
              rule: true,
              run: async () => {
                if (await host.dialog.confirm(gone(row.title, row.local, t('deleteDeckStays')), { title: t('deleteDeck'), ok: t('delete'), danger: true })) {
                  await act(t('deleteDeckFailed'), () => host.del(`deck?id=${Q(row.id)}`));
                }
              },
            },
          ]
        : []),
    ];
  };
  const entry = (label: string, to: string, items: MenuEntry[], count?: number | string, local = false): JSX.Element => (
    <NavLink
      key={to}
      href={to}
      onContextMenu={opens(items)}
      active={here.replace(/\/(?=\?|$)/, '') === to.replace(/\/(?=\?|$)/, '')}
      onClick={(event: { preventDefault: () => void }) => {
        event.preventDefault();
        host.navigate(to);
      }}
    >
      {label}
      {local && <LocalMark />}
      {count !== undefined && <NavCount>{count}</NavCount>}
    </NavLink>
  );
  const root = pageHref(host, '');
  const group = (label: string, what: 'quiz' | 'deck' | 'course'): JSX.Element => (
    <NavGroup onContextMenu={opens([what === 'quiz' ? newQuiz : what === 'deck' ? newDeck : newCourse])}>
      <span>{label}</span>
      <Button
        size="sm"
        variant="quiet"
        aria-label={what === 'quiz' ? t('newQuiz') : what === 'deck' ? t('newDeck') : t('newCourse')}
        title={what === 'quiz' ? t('newQuiz') : what === 'deck' ? t('newDeck') : t('newCourse')}
        onClick={() => setMaking(what)}
      >
        +
      </Button>
    </NavGroup>
  );
  return (
    <Surface>
      <Nav>
        <NavHead>
          <b>{t('academy')}</b>
        </NavHead>
        {entry(t('getStarted'), pageHref(host, 'start'), [go(t('open'), pageHref(host, 'start'))])}
        {decks.length > 0 && entry(t('keepStudying'), pageHref(host, 'keep-studying'), [go(t('open'), pageHref(host, 'keep-studying')), go(t('studyAcrossDecks'), pageHref(host, 'study'))])}
        {(quizzes.length > 0 || decks.length > 0 || courses.length > 0) && entry(t('everything'), root, [go(t('open'), root), { ...newQuiz, rule: true }, newDeck, newCourse], quizzes.length + decks.length)}
        {data &&
          alias !== null &&
          courses.some((course) => course.created_by === alias) &&
          entry(
            t('createdByMe'),
            `${root}?show=mine`,
            [go(t('open'), `${root}?show=mine`), { ...newQuiz, rule: true }, newDeck, newCourse],
            [...quizzes, ...decks].filter((row) => isMine(row, data)).length,
          )}
        {enrolled.length > 0 && entry(t('myCourses'), pageHref(host, 'my-courses'), [go(t('open'), pageHref(host, 'my-courses'))], enrolled.length)}
        {data && (
          <>
            {group(t('courses'), 'course')}
            {courses.map((course) => {
              const inCourse = quizzes.filter((row) => row.course === course.id);
              const decksIn = decks.filter((row) => row.course === course.id).length;
              return entry(
                course.title,
                pageHref(host, `course/${Q(course.id)}`),
                courseMenu(course),
                course.enrolled || course.local ? `${inCourse.filter((row) => row.best !== null).length}/${inCourse.length}` : inCourse.length + decksIn,
                course.local,
              );
            })}
            {group(t('quizzes'), 'quiz')}
            {quizzes.filter((row) => row.course === null).map((row) => entry(row.title, pageHref(host, `quiz/${Q(row.id)}`), quizMenu(row), undefined, row.local))}
            {group(t('decks'), 'deck')}
            {decks.filter((row) => row.course === null).map((row) => entry(row.title, pageHref(host, `deck/${Q(row.id)}`), deckMenu(row), undefined, row.local))}
          </>
        )}
      </Nav>
      {making === 'quiz' && <NewQuiz onClose={() => setMaking(null)} courses={courses} draws={[]} course={null} />}
      {making === 'deck' && <NewDeck onClose={() => setMaking(null)} courses={courses} quizzes={quizzes} draws={[]} course={null} fromQuiz={null} />}
      {making === 'course' && <NewCourse onClose={() => setMaking(null)} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </Surface>
  );
}

// ---- the list ---------------------------------------------------------------------------------

type SortKey = 'title' | 'course' | 'size' | 'created_by' | 'you';

// A quiz or a deck as the list shows it.
interface ListRow {
  kind: 'quiz' | 'deck';
  id: string;
  title: string;
  course: string | null;
  course_title: string | null;
  place: number | null;
  draws_from: string[];
  size: number;
  size_label: string;
  created_by: string | null;
  created_by_name: string | null;
  status: 'open' | 'closed';
  // what the person has: their best on a quiz, the share of a deck they have learned
  you: number;
  you_label: string | null;
  local: boolean;
}

// A quiz a person has no settled score on yet but has an answer waiting for a grade says waitingForGrade.
function listRows(t: PluginHost['t'], overview: Overview): ListRow[] {
  return [
    ...overview.quizzes.map((row) => ({
      kind: 'quiz' as const,
      ...row,
      size: row.questions,
      size_label: t(row.questions === 1 ? 'questionCountOne' : 'questionCount', { n: row.questions }),
      you: row.best ?? -1,
      you_label: row.best !== null ? t('bestPercent', { percent: asPercent(row.best) }) : row.waiting ? t('waitingForGrade') : null,
    })),
    ...overview.decks.map((row) => ({
      kind: 'deck' as const,
      ...row,
      size: row.cards,
      size_label: t(row.cards === 1 ? 'cardCountOne' : 'cardCount', { n: row.cards }),
      you: row.cards === 0 || row.learned + row.learning === 0 ? -1 : row.learned / row.cards,
      you_label: row.learned + row.learning === 0 ? null : t('learnedOf', { learned: row.learned, of: row.cards }),
    })),
  ];
}

// What the Quizzes plugin left, offered to the project's owners in one step.
function QuizzesLeft({ left, reload }: { left: NonNullable<Overview['quizzes_left']>; reload: () => void }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const act = useAct();
  const [then, setThen] = useState<string[] | null>(null);
  if (then)
    return (
      <div style={{ marginBottom: 14 }}>
        <Notice>
          {t('quizzesMoved')}
          {then.length > 0 && (
            <>
              {' '}
              {t('quizzesMovedThen')}
              <pre className="qz-pre">{then.join('\n')}</pre>
            </>
          )}
        </Notice>
      </div>
    );
  return (
    <div style={{ marginBottom: 14 }}>
      <Notice>
        {t('quizzesLeft', {
          files: t(left.quizzes === 1 ? 'quizFilesOne' : 'quizFiles', { n: left.quizzes }),
          results: t(left.results === 1 ? 'resultFilesOne' : 'resultFiles', { n: left.results }),
        })}{' '}
        {left.may_move ? (
          <Button
            size="sm"
            onClick={async () => {
              if (
                !(await host.dialog.confirm(t('moveQuizzesAsk'), {
                  title: t('moveIntoAcademy'),
                  ok: t('move'),
                }))
              )
                return;
              await act(t('moveFailed'), async () => {
                const moved = await host.post<{ then: string[] }>('move-quizzes');
                setThen(moved.then);
                reload();
              });
            }}
          >
            {t('moveThemIntoAcademy')}
          </Button>
        ) : (
          t('ownerCanMove')
        )}
      </Notice>
    </div>
  );
}

const PAGE_SIZES = [25, 50, 100, 250];

function QuizList({ show }: { show: string | null }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const { data, error, reload } = useData<Overview>('overview');
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('');
  const [creator, setCreator] = useState('');
  const [kind, setKind] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; turned: boolean } | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [making, setMaking] = useState<'quiz' | 'deck' | 'course' | null>(null);
  useTrail(null);
  // nothing to list: the landing page is Get started, on its own address so writing its first file never takes it away
  const nothing = data !== null && data.quizzes.length === 0 && data.decks.length === 0 && data.courses.length === 0 && data.quizzes_left === null;
  useEffect(() => {
    if (nothing && show === null) host.navigate(pageHref(host, 'start'), { replace: true });
  }, [host, nothing, show]);

  const rows = useMemo(() => {
    if (!data) return [];
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const kept = listRows(t, data).filter((row) => {
      if (show === 'mine' && !isMine(row, data)) return false;
      if (kind && row.kind !== kind) return false;
      if (course && (course === 'oneoff' ? row.course !== null : row.course !== course)) return false;
      if (creator && row.created_by !== creator) return false;
      const held = `${row.id} ${row.title} ${row.course_title ?? ''} ${row.draws_from.join(' ')} ${row.created_by ?? ''} ${row.created_by_name ?? ''}`.toLowerCase();
      return words.every((word) => held.includes(word));
    });
    if (!sort) return kept;
    const value = (row: ListRow): string | number =>
      sort.key === 'course' ? `${row.course_title ?? '~'} ${row.place ?? 0}` : sort.key === 'you' ? row.you : sort.key === 'size' ? row.size : (row[sort.key] ?? '');
    const ordered = [...kept].sort((a, b) => {
      const [left, right] = [value(a), value(b)];
      return typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
    });
    return sort.turned ? ordered.reverse() : ordered;
  }, [data, search, course, creator, kind, sort, show, t]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const at = Math.min(page, pages - 1);
  const shown = rows.slice(at * pageSize, (at + 1) * pageSize);
  // ← and → page the table, except from a field, a tab, or with a modal over it
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], [role="tab"]')) return;
      if (document.querySelector('[data-slot=backdrop]')) return;
      if (event.key === 'ArrowLeft' && at > 0) setPage(at - 1);
      else if (event.key === 'ArrowRight' && at < pages - 1) setPage(at + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, pages]);

  if (error) return <Failed message={error} />;
  if (nothing && show === null) return <Loading />;

  const narrow = <T,>(set: (value: T) => void, value: T): void => {
    set(value);
    setPage(0);
  };
  const header = (key: SortKey, label: string): JSX.Element => (
    <th
      role="button"
      aria-sort={sort?.key === key ? (sort.turned ? 'descending' : 'ascending') : undefined}
      onClick={() => setSort(sort?.key !== key ? { key, turned: false } : !sort.turned ? { key, turned: true } : null)}
    >
      {label}
      {sort?.key === key && <span className="qz-dt-dir">{sort.turned ? '↓' : '↑'}</span>}
    </th>
  );
  const creators = [
    ...new Map([...(data?.quizzes ?? []), ...(data?.decks ?? [])].flatMap((row) => (row.created_by ? [[row.created_by, row.created_by_name ?? row.created_by] as const] : []))).entries(),
  ];
  const open = (row: ListRow): void => host.navigate(pageHref(host, `${row.kind}/${Q(row.id)}`));
  const first = rows.length === 0 ? 0 : at * pageSize + 1;
  const last = Math.min(rows.length, (at + 1) * pageSize);
  return (
    <Surface>
      <Page>
        <PageHead>
          <Row justify="between" wrap style={{ width: '100%' }}>
            <Row gap="sm">
              <PageTitle>{t('academy')}</PageTitle>
              {data && <Text tone="faint">{rows.length}</Text>}
            </Row>
            <Row gap="sm">
              <Button onClick={() => setMaking('course')}>{t('newCourse')}</Button>
              <Button onClick={() => setMaking('deck')}>{t('newDeck')}</Button>
              <Button variant="primary" onClick={() => setMaking('quiz')}>
                {t('newQuiz')}
              </Button>
            </Row>
          </Row>
        </PageHead>
        {data?.quizzes_left && <QuizzesLeft left={data.quizzes_left} reload={reload} />}
        <div className="qz-filters">
          <div className="qz-filters-top">
            <span className="qz-search" data-set={search !== '' || undefined}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" />
                <path d="M10.5 10.5L14 14" />
              </svg>
              <Input
                type="search"
                aria-label={t('searchQuizzesAndDecks')}
                placeholder={t('search')}
                value={search}
                onChange={(event: { target: HTMLInputElement }) => narrow(setSearch, event.target.value)}
                onKeyDown={(event: { key: string; currentTarget: HTMLInputElement }) => event.key === 'Escape' && event.currentTarget.blur()}
              />
              {search !== '' && (
                <button type="button" aria-label={t('clearSearch')} onClick={() => narrow(setSearch, '')}>
                  ×
                </button>
              )}
            </span>
            <Button size="icon" aria-label={t('refresh')} title={t('refresh')} onClick={reload}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M13 3.5v3h-3M3 12.5v-3h3" />
                <path d="M12.6 6.5A5 5 0 0 0 3.6 5.2M3.4 9.5a5 5 0 0 0 9 1.3" />
              </svg>
            </Button>
          </div>
          <div className="qz-filters-row">
            <Select filter aria-label={t('filterKind')} value={kind} onChange={(event: { target: HTMLSelectElement }) => narrow(setKind, event.target.value)}>
              <option value="">{t('filterKind')}</option>
              <option value="quiz">{t('quizzes')}</option>
              <option value="deck">{t('decks')}</option>
            </Select>
            <Select filter aria-label={t('course')} value={course} onChange={(event: { target: HTMLSelectElement }) => narrow(setCourse, event.target.value)}>
              <option value="">{t('course')}</option>
              {(data?.courses ?? []).map((held) => (
                <option key={held.id} value={held.id}>
                  {held.title}
                </option>
              ))}
              <option value="oneoff">{t('oneOff')}</option>
            </Select>
            <Select filter aria-label={t('createdBy')} value={creator} onChange={(event: { target: HTMLSelectElement }) => narrow(setCreator, event.target.value)}>
              <option value="">{t('createdBy')}</option>
              {creators.map(([alias, name]) => (
                <option key={alias} value={alias}>
                  {name}
                </option>
              ))}
            </Select>
            {(search !== '' || course !== '' || creator !== '' || kind !== '') && (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  setSearch('');
                  setCourse('');
                  setCreator('');
                  setKind('');
                  setPage(0);
                }}
              >
                {t('clear')}
              </Button>
            )}
          </div>
        </div>
        <div className="qz-dt-wrap" data-slot="table-wrap">
          <table className="qz-dt">
            <thead>
              <tr>
                {header('title', t('title'))}
                {header('course', t('course'))}
                <th>{t('drawsFrom')}</th>
                {header('size', t('size'))}
                {header('created_by', t('createdBy'))}
                {header('you', t('you'))}
              </tr>
            </thead>
            <tbody>
              {!data &&
                [0, 1, 2, 3, 4, 5].map((row) => (
                  <tr key={row}>
                    {[0, 1, 2, 3, 4, 5].map((cell) => (
                      <td key={cell}>
                        <SkeletonBar width={cell === 0 ? 180 : 70} height={12} />
                      </td>
                    ))}
                  </tr>
                ))}
              {shown.map((row) => (
                <tr
                  key={`${row.kind}/${row.id}`}
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest('a, button')) open(row);
                  }}
                >
                  <td data-cell="title">
                    <button className="qz-rowlink" onClick={() => open(row)}>
                      {row.title}
                    </button>
                    {row.kind === 'deck' && (
                      <>
                        {' '}
                        <Badge>{t('deck')}</Badge>
                      </>
                    )}
                    {row.local && (
                      <>
                        {' '}
                        <Badge>
                          <span className="qz-chip-local">
                            <LaptopMark /> {t('local')}
                          </span>
                        </Badge>
                      </>
                    )}
                    {row.status === 'closed' && (
                      <>
                        {' '}
                        <Badge>{t('closed')}</Badge>
                      </>
                    )}
                    <div className="qz-dt-id">{row.id}</div>
                  </td>
                  <td>
                    {row.course ? (
                      <Link className="qz-dt-link" to={pageHref(host, `course/${Q(row.course)}`)}>
                        {row.course_title} · {row.place}
                      </Link>
                    ) : (
                      <Text tone="faint">{t('oneOff')}</Text>
                    )}
                  </td>
                  <td>{row.draws_from.join(', ') || <Text tone="faint">{t('nothingYet')}</Text>}</td>
                  <td>{row.size_label}</td>
                  <td>{row.created_by ? <UserPill alias={row.created_by} name={row.created_by_name} /> : <Text tone="faint">{t('unknown')}</Text>}</td>
                  <td>{row.you_label === null ? <Text tone="faint">{t('notYet')}</Text> : row.you_label}</td>
                </tr>
              ))}
              {data && rows.length === 0 && (
                <tr>
                  <td className="qz-dt-empty" colSpan={6}>
                    {data.quizzes.length + data.decks.length === 0 ? t('listEmpty') : t('listNoMatch')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="qz-pager">
          <Select aria-label={t('rowsPerPage')} value={String(pageSize)} onChange={(event: { target: HTMLSelectElement }) => narrow(setPageSize, Number(event.target.value))}>
            {PAGE_SIZES.map((size) => (
              <option key={size} value={String(size)}>
                {t('perPage', { n: size })}
              </option>
            ))}
          </Select>
          <span className="qz-pager-steps">
            <button type="button" aria-label={t('previousPage')} disabled={at === 0} onClick={() => setPage(at - 1)}>
              ‹
            </button>
            <span>{rows.length === 0 ? t('noRows') : t('pageRange', { first, last, total: rows.length })}</span>
            <button type="button" aria-label={t('nextPage')} disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
              ›
            </button>
          </span>
        </div>
      </Page>
      {making === 'quiz' && <NewQuiz onClose={() => setMaking(null)} courses={data?.courses ?? []} draws={[]} course={null} />}
      {making === 'deck' && <NewDeck onClose={() => setMaking(null)} courses={data?.courses ?? []} quizzes={data?.quizzes ?? []} draws={[]} course={null} fromQuiz={null} />}
      {making === 'course' && <NewCourse onClose={() => setMaking(null)} />}
    </Surface>
  );
}

// ---- making things -------------------------------------------------------------------------------

// What a quiz draws from, as pills, added from the project's blueprints or as a link or an asset path.
function DrawsFrom({ sources, onChange, picks }: { sources: string[]; onChange: (next: string[]) => void; picks: Pickable | null }): JSX.Element {
  const { t } = usePluginHost();
  const [link, setLink] = useState('');
  return (
    <Row gap="xs" wrap>
      {sources.map((source) => (
        <span className="qz-pill" key={source}>
          {source}
          <button aria-label={t('removeSource', { source })} onClick={() => onChange(sources.filter((held) => held !== source))}>
            ×
          </button>
        </span>
      ))}
      <span className="qz-add">
        <Select aria-label={t('addBlueprint')} value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && onChange([...sources, event.target.value])}>
          <option value="" hidden>
            {t('addBlueprintPick')}
          </option>
          {(picks?.blueprints ?? [])
            .filter((held) => !sources.includes(held.id))
            .map((held) => (
              <option key={held.id} value={held.id}>
                {held.id} {held.title}
              </option>
            ))}
        </Select>
      </span>
      <Input
        aria-label={t('addLinkOrAsset')}
        placeholder={t('addLinkOrAsset')}
        value={link}
        onChange={(event: { target: HTMLInputElement }) => setLink(event.target.value)}
        onKeyDown={(event: { key: string; preventDefault: () => void }) => {
          if (event.key === 'Enter' && link.trim()) {
            event.preventDefault();
            onChange([...sources, link.trim()]);
            setLink('');
          }
        }}
      />
    </Row>
  );
}

// Who a new quiz, deck, or course is for (Academy REQ76): the project, picked already, or just the person,
// kept on this machine. Its words say what nobody else will see of it.
function WhoFor({ local, onChange, what }: { local: boolean; onChange: (local: boolean) => void; what: 'quiz' | 'deck' | 'course' }): JSX.Element {
  const { t } = usePluginHost();
  const unseen = what === 'quiz' ? t('whoForLocalQuiz') : what === 'deck' ? t('whoForLocalDeck') : t('whoForLocalCourse');
  return (
    <div>
      <span className="qz-label">{t('whoFor')}</span>
      <Seg>
        <SegItem active={!local} selected={!local} onClick={() => onChange(false)}>
          {t('theProject')}
        </SegItem>
        <SegItem active={local} selected={local} onClick={() => onChange(true)}>
          <span className="qz-chip-local">
            <LaptopMark /> {t('justMe')}
          </span>
        </SegItem>
      </Seg>
      {local && (
        <Text tone="faint" size="sm" block>
          {unseen}
        </Text>
      )}
    </div>
  );
}

// The courses a new quiz or deck may go in: a course and what is in it are all the person's or all the project's (Academy REQ79).
function CoursePick({
  courses,
  local,
  value,
  onChange,
}: {
  courses: Array<{ id: string; title: string; local?: boolean }>;
  local: boolean;
  value: string;
  onChange: (course: string) => void;
}): JSX.Element {
  const { t } = usePluginHost();
  const offered = courses.filter((held) => Boolean(held.local) === local);
  return (
    <div>
      <span className="qz-label">{t('courseOptional')}</span>
      <Select aria-label={t('course')} value={value} onChange={(event: { target: HTMLSelectElement }) => onChange(event.target.value)}>
        <option value="">-</option>
        {offered.map((held) => (
          <option key={held.id} value={held.id}>
            {held.title}
          </option>
        ))}
      </Select>
      {local && (
        <Text tone="faint" size="sm" block>
          {t('localCoursesOnly')}
        </Text>
      )}
    </div>
  );
}

export function NewQuiz({
  onClose,
  courses,
  draws,
  course: startCourse,
}: {
  onClose: () => void;
  courses: Array<{ id: string; title: string; local?: boolean }>;
  draws: string[];
  course: string | null;
}): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const act = useAct();
  const { data: picks } = useData<Pickable>('pickable');
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState(startCourse ?? '');
  const [local, setLocal] = useState(Boolean(courses.find((held) => held.id === startCourse)?.local));
  const choose = (next: boolean): void => {
    setLocal(next);
    if (course && Boolean(courses.find((held) => held.id === course)?.local) !== next) setCourse('');
  };
  const [sources, setSources] = useState<string[]>(draws);
  const [start, setStart] = useState<'generate' | 'write'>('generate');
  const [count, setCount] = useState('20');
  const create = async (): Promise<void> => {
    await act(t('createQuizFailed'), async () => {
      const quiz = await host.post<Quiz>('quiz', { title, draws_from: sources, course: course || null, local });
      onClose();
      host.navigate(`${pageHref(host, `quiz/${Q(quiz.id)}/questions`)}${start === 'generate' ? `?generate=${Q(count)}` : ''}`);
    });
  };
  return (
    <Modal
      title={t('newQuiz')}
      onClose={onClose}
      foot={
        <Row justify="end" gap="sm">
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" disabled={title.trim() === ''} onClick={create}>
            {start === 'generate' ? t('createAndGenerate') : t('createQuiz')}
          </Button>
        </Row>
      }
    >
      <Stack gap="md" pad="md">
        <label>
          <span className="qz-label">{t('title')}</span>
          <Input autoFocus value={title} onChange={(event: { target: HTMLInputElement }) => setTitle(event.target.value)} />
        </label>
        <WhoFor local={local} onChange={choose} what="quiz" />
        <CoursePick courses={courses} local={local} value={course} onChange={setCourse} />
        <div>
          <span className="qz-label">{t('drawsFrom')}</span>
          <DrawsFrom sources={sources} onChange={setSources} picks={picks} />
        </div>
        <div>
          <span className="qz-label">{t('howToStart')}</span>
          <Seg>
            <SegItem active={start === 'generate'} selected={start === 'generate'} onClick={() => setStart('generate')}>
              {t('generateWithAi')}
            </SegItem>
            <SegItem active={start === 'write'} selected={start === 'write'} onClick={() => setStart('write')}>
              {t('writeThemMyself')}
            </SegItem>
          </Seg>
        </div>
        {start === 'generate' && (
          <label>
            <span className="qz-label">{t('questions')}</span>
            <Input type="number" value={count} onChange={(event: { target: HTMLInputElement }) => setCount(event.target.value)} />
          </label>
        )}
      </Stack>
    </Modal>
  );
}

export function NewDeck({
  onClose,
  courses,
  quizzes,
  draws,
  course: startCourse,
  fromQuiz,
}: {
  onClose: () => void;
  courses: Array<{ id: string; title: string; local?: boolean }>;
  quizzes: Array<{ id: string; title: string; questions: number; local?: boolean }>;
  draws: string[];
  course: string | null;
  fromQuiz: string | null;
}): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const act = useAct();
  const { data: picks } = useData<Pickable>('pickable');
  const hasAgent = agentOf(host) !== undefined;
  const withQuestions = quizzes.filter((quiz) => quiz.questions > 0);
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState(startCourse ?? '');
  const [sources, setSources] = useState<string[]>(draws);
  const [start, setStart] = useState<'generate' | 'quiz' | 'write'>(fromQuiz ? 'quiz' : hasAgent ? 'generate' : 'write');
  const [quiz, setQuiz] = useState(fromQuiz ?? withQuestions[0]?.id ?? '');
  const [count, setCount] = useState('20');
  // a deck made from a quiz kept just for the person starts as theirs too
  const [local, setLocal] = useState(Boolean(courses.find((held) => held.id === startCourse)?.local ?? quizzes.find((held) => held.id === fromQuiz)?.local));
  const choose = (next: boolean): void => {
    setLocal(next);
    if (course && Boolean(courses.find((held) => held.id === course)?.local) !== next) setCourse('');
  };
  const create = async (): Promise<void> => {
    await act(t('createDeckFailed'), async () => {
      const made = await host.post<Deck>('deck', { title, draws_from: sources, course: course || null, from_quiz: start === 'quiz' ? quiz : null, local });
      onClose();
      host.navigate(start === 'quiz' ? pageHref(host, `deck/${Q(made.id)}`) : `${pageHref(host, `deck/${Q(made.id)}/cards`)}${start === 'generate' ? `?generate=${Q(count)}` : ''}`);
    });
  };
  return (
    <Modal
      title={t('newDeck')}
      onClose={onClose}
      foot={
        <Row justify="end" gap="sm">
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" disabled={title.trim() === '' || (start === 'quiz' && !quiz)} onClick={create}>
            {start === 'generate' ? t('createAndGenerate') : t('createDeck')}
          </Button>
        </Row>
      }
    >
      <Stack gap="md" pad="md">
        <label>
          <span className="qz-label">{t('title')}</span>
          <Input autoFocus value={title} onChange={(event: { target: HTMLInputElement }) => setTitle(event.target.value)} />
        </label>
        <WhoFor local={local} onChange={choose} what="deck" />
        <CoursePick courses={courses} local={local} value={course} onChange={setCourse} />
        <div>
          <span className="qz-label">{t('drawsFrom')}</span>
          <DrawsFrom sources={sources} onChange={setSources} picks={picks} />
        </div>
        <div>
          <span className="qz-label">{t('howToStart')}</span>
          <Seg>
            <SegItem active={start === 'generate'} selected={start === 'generate'} disabled={!hasAgent} onClick={() => setStart('generate')}>
              {t('generateWithAi')}
            </SegItem>
            <SegItem active={start === 'quiz'} selected={start === 'quiz'} disabled={withQuestions.length === 0} onClick={() => setStart('quiz')}>
              {t('fromAQuiz')}
            </SegItem>
            <SegItem active={start === 'write'} selected={start === 'write'} onClick={() => setStart('write')}>
              {t('writeThemMyself')}
            </SegItem>
          </Seg>
        </div>
        {start === 'generate' && (
          <label>
            <span className="qz-label">{t('cards')}</span>
            <Input type="number" value={count} onChange={(event: { target: HTMLInputElement }) => setCount(event.target.value)} />
          </label>
        )}
        {start === 'quiz' && (
          <div>
            <span className="qz-label">{t('quizCardsComeFrom')}</span>
            <Select aria-label={t('quiz')} value={quiz} onChange={(event: { target: HTMLSelectElement }) => setQuiz(event.target.value)}>
              {withQuestions.map((held) => (
                <option key={held.id} value={held.id}>
                  {t('titleWithCount', { title: held.title, count: t(held.questions === 1 ? 'questionCountOne' : 'questionCount', { n: held.questions }) })}
                </option>
              ))}
            </Select>
            <Text tone="faint" size="sm" block>
              {t('fromQuizHint')}
            </Text>
          </div>
        )}
      </Stack>
    </Modal>
  );
}

function NewCourse({ onClose }: { onClose: () => void }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const act = useAct();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [local, setLocal] = useState(false);
  const create = async (): Promise<void> => {
    await act(t('createCourseFailed'), async () => {
      const course = await host.post<Course>('course', { title, description, local });
      onClose();
      host.navigate(pageHref(host, `course/${Q(course.id)}`));
    });
  };
  return (
    <Modal
      title={t('newCourse')}
      onClose={onClose}
      foot={
        <Row justify="end" gap="sm">
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" disabled={title.trim() === ''} onClick={create}>
            {t('createCourse')}
          </Button>
        </Row>
      }
    >
      <Stack gap="md" pad="md">
        <label>
          <span className="qz-label">{t('title')}</span>
          <Input autoFocus value={title} onChange={(event: { target: HTMLInputElement }) => setTitle(event.target.value)} />
        </label>
        <WhoFor local={local} onChange={setLocal} what="course" />
        <label>
          <span className="qz-label">{t('descriptionOptional')}</span>
          <Textarea rows={3} value={description} onChange={(event: { target: HTMLTextAreaElement }) => setDescription(event.target.value)} />
        </label>
      </Stack>
    </Modal>
  );
}

// ---- Get started ---------------------------------------------------------------------------------

type StartScreen = 'what' | 'name' | 'content' | 'questions';
// each label is the catalog's key for it
const START_SCREENS: Array<{ key: StartScreen; label: string }> = [
  { key: 'what', label: 'startWhat' },
  { key: 'name', label: 'startName' },
  { key: 'content', label: 'startContent' },
  { key: 'questions', label: 'startQuestions' },
];

function Tile({ checked, name, hint, disabled, onClick }: { checked: boolean; name: string; hint: string; disabled?: boolean; onClick: () => void }): JSX.Element {
  return (
    <button type="button" role="radio" aria-checked={checked} className="qz-tile" disabled={disabled} onClick={onClick}>
      <strong>{name}</strong>
      <span className="qz-muted qz-small">{hint}</span>
    </button>
  );
}

// The tutorial a project with no quizzes lands on, and the menu keeps: the choices that make a first
// quiz, as Backlog Setup asks its own. Nothing is written until the last screen's button.
function GetStarted(): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const { data: picks } = useData<Pickable>('pickable');
  const hasAgent = agentOf(host) !== undefined;
  const [screen, setScreen] = useState<StartScreen>('what');
  const [making, setMaking] = useState<'quiz' | 'deck' | 'course'>('quiz');
  const [courseTitle, setCourseTitle] = useState('');
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [way, setWay] = useState<'generate' | 'write'>(hasAgent ? 'generate' : 'write');
  const [count, setCount] = useState('20');
  const [madeCourse, setMadeCourse] = useState<string | null>(null);
  const [local, setLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useTrail([{ label: t('academy'), href: pageHref(host, '') }, { label: t('getStarted') }]);
  const firstField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (screen === 'name') firstField.current?.focus();
  }, [screen]);
  const at = START_SCREENS.findIndex((held) => held.key === screen);
  const named = title.trim() !== '' && (making !== 'course' || courseTitle.trim() !== '');
  const what = making === 'deck' ? 'deck' : 'quiz';
  const screens = START_SCREENS.map((held) => (held.key === 'questions' ? { ...held, label: making === 'deck' ? 'startCards' : 'startQuestions' } : held));
  const finish = async (): Promise<void> => {
    setBusy(true);
    setFailure(null);
    try {
      // a retry after the quiz failed does not make the course twice
      let course = making === 'course' ? madeCourse : null;
      if (making === 'course' && course === null) {
        course = (await host.post<Course>('course', { title: courseTitle, description, local })).id;
        setMadeCourse(course);
      }
      const made =
        making === 'deck' ? await host.post<Deck>('deck', { title, draws_from: sources, course: null, local }) : await host.post<Quiz>('quiz', { title, draws_from: sources, course, local });
      const asks = new URLSearchParams({ made: made.id, ...(making === 'deck' ? { kind: 'deck' } : {}), ...(course ? { course } : {}), ...(way === 'generate' ? { generate: count } : {}) });
      host.navigate(`${pageHref(host, 'start')}?${asks.toString()}`);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };
  return (
    <Surface>
      <Page>
        <div className="qz qz-start">
          <header>
            <h1 className="qz-start-title">{t('getStartedTitle')}</h1>
            <p className="qz-muted" style={{ margin: 0 }}>
              {t('getStartedIntro')}
            </p>
          </header>
          <ol className="qz-steps" aria-label={t('getStartedSteps')}>
            {screens.map((held, index) => (
              <li key={held.key} data-state={index < at ? 'done' : index === at ? 'here' : 'ahead'} aria-current={index === at ? 'step' : undefined}>
                <button type="button" disabled={index >= at || busy} onClick={() => setScreen(held.key)}>
                  <span className="qz-step-mark">{index < at ? '✓' : index + 1}</span>
                  <span>{t(held.label)}</span>
                </button>
              </li>
            ))}
          </ol>
          {failure && <Notice tone="error">{failure}</Notice>}
          {screen === 'what' && (
            <div className="qz-tiles" role="radiogroup" aria-label={t('startWhat')}>
              <Tile checked={making === 'quiz'} name={t('aQuiz')} hint={t('aQuizHint')} onClick={() => setMaking('quiz')} />
              <Tile checked={making === 'deck'} name={t('aDeck')} hint={t('aDeckHint')} onClick={() => setMaking('deck')} />
              <Tile checked={making === 'course'} name={t('aCourse')} hint={t('aCourseHint')} onClick={() => setMaking('course')} />
            </div>
          )}
          {screen === 'what' && <WhoFor local={local} onChange={setLocal} what={making} />}
          {screen === 'name' && (
            <Stack gap="md">
              {making === 'course' && (
                <>
                  <label>
                    <span className="qz-label">{t('courseTitleLabel')}</span>
                    <Input ref={firstField} value={courseTitle} onChange={(event: { target: HTMLInputElement }) => setCourseTitle(event.target.value)} />
                  </label>
                  <label>
                    <span className="qz-label">{t('coversOptional')}</span>
                    <Textarea rows={2} value={description} onChange={(event: { target: HTMLTextAreaElement }) => setDescription(event.target.value)} />
                  </label>
                </>
              )}
              <label>
                <span className="qz-label">{making === 'course' ? t('firstQuizLabel') : what === 'deck' ? t('deckTitleLabel') : t('quizTitleLabel')}</span>
                <Input {...(making !== 'course' ? { ref: firstField } : {})} value={title} onChange={(event: { target: HTMLInputElement }) => setTitle(event.target.value)} />
              </label>
            </Stack>
          )}
          {screen === 'content' && (
            <div>
              <span className="qz-label">{making === 'deck' ? t('startDrawsFromDeck') : t('startDrawsFromQuiz')}</span>
              <DrawsFrom sources={sources} onChange={setSources} picks={picks} />
            </div>
          )}
          {screen === 'questions' && (
            <Stack gap="md">
              <div className="qz-tiles" role="radiogroup" aria-label={making === 'deck' ? t('startCards') : t('startQuestions')}>
                <Tile
                  checked={way === 'generate'}
                  name={t('generateWithAi')}
                  hint={
                    hasAgent ? (what === 'deck' ? t('agentWritesDeck') : t('agentWritesQuiz')) : making === 'deck' ? t('noAgentCards') : t('noAgentQuestions')
                  }
                  disabled={!hasAgent}
                  onClick={() => setWay('generate')}
                />
                <Tile
                  checked={way === 'write'}
                  name={t('writeThemMyself')}
                  hint={making === 'deck' ? t('writeCardsHint') : t('writeQuestionsHint')}
                  onClick={() => setWay('write')}
                />
              </div>
              {way === 'generate' && (
                <label>
                  <span className="qz-label">{making === 'deck' ? t('howManyCards') : t('howManyQuestions')}</span>
                  <Input type="number" value={count} onChange={(event: { target: HTMLInputElement }) => setCount(event.target.value)} />
                </label>
              )}
            </Stack>
          )}
          <Row gap="sm" wrap>
            {at > 0 && (
              <Button disabled={busy} onClick={() => setScreen(screens[at - 1]!.key)}>
                {t('back')}
              </Button>
            )}
            <span style={{ flex: 1 }} />
            {screen === 'questions' ? (
              <Button variant="primary" disabled={busy} onClick={finish}>
                {making === 'course' ? t('createCourse') : making === 'deck' ? t('createDeck') : t('createQuiz')}
              </Button>
            ) : (
              <Button variant="primary" disabled={screen === 'name' && !named} onClick={() => setScreen(screens[at + 1]!.key)}>
                {t('continue')}
              </Button>
            )}
          </Row>
        </div>
      </Page>
    </Surface>
  );
}

// What Get started closes on: what else there is, and the way to the questions or the cards.
function StartClosing({ made, deck, course, generate }: { made: string; deck: boolean; course: string | null; generate: string | null }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  useTrail([{ label: t('academy'), href: pageHref(host, '') }, { label: t('getStarted') }]);
  const onCourse = course ? pageHref(host, `course/${Q(course)}`) : pageHref(host, '');
  const items = deck
    ? [
        { name: t('keepStudying'), hint: t('keepStudyingHint'), to: pageHref(host, 'keep-studying') },
        { name: t('quizzes'), hint: t('quizzesHint'), to: pageHref(host, '') },
        { name: t('courses'), hint: t('coursesHint'), to: onCourse },
      ]
    : [
        { name: t('proctors'), hint: t('proctorsHint'), to: pageHref(host, `quiz/${Q(made)}`) },
        { name: course ? t('yourCourse') : t('courses'), hint: t('coursesHint'), to: onCourse },
        { name: t('studyPlans'), hint: t('studyPlansHint'), to: onCourse },
      ];
  const write = deck ? pageHref(host, `deck/${Q(made)}/cards`) : pageHref(host, `quiz/${Q(made)}/questions`);
  return (
    <Surface>
      <Page>
        <div className="qz qz-start">
          <header>
            <h1 className="qz-start-title">{deck ? t('deckReady') : t('quizReady')}</h1>
            <p className="qz-muted" style={{ margin: 0 }}>
              {deck ? t('deckReadyHint') : t('quizReadyHint')}
            </p>
          </header>
          <div className="qz-tiles">
            {items.map((item) => (
              <Link key={item.name} className="qz-tile" to={item.to}>
                <strong>{item.name}</strong>
                <span className="qz-muted qz-small">{item.hint}</span>
              </Link>
            ))}
          </div>
          <Row justify="end">
            <Button variant="primary" onClick={() => host.navigate(`${write}${generate ? `?generate=${Q(generate)}` : ''}`)}>
              {generate ? (deck ? t('generateYourCards') : t('generateYourQuestions')) : deck ? t('writeYourCards') : t('writeYourQuestions')}
            </Button>
          </Row>
        </div>
      </Page>
    </Surface>
  );
}

// ---- my courses ------------------------------------------------------------------------------------

function MyCourses(): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const { data, error } = useData<Overview>('overview');
  useTrail([{ label: t('academy'), href: pageHref(host, '') }, { label: t('myCourses') }]);
  if (error) return <Failed message={error} />;
  if (!data) return <Loading />;
  const enrolled = data.courses.filter((course) => course.enrolled);
  return (
    <Surface>
      <Page>
        <div className="qz">
          <h1 className="qz-h1" style={{ marginBottom: 18 }}>
            {t('myCourses')}
          </h1>
          {enrolled.length === 0 && <Empty>{t('notEnrolled')}</Empty>}
          {enrolled.map((course) => {
            const quizzes = data.quizzes.filter((row) => row.course === course.id);
            const taken = quizzes.filter((row) => row.best !== null);
            const average = taken.length > 0 ? taken.reduce((sum, row) => sum + row.best!, 0) / taken.length : null;
            return (
              <div className="qz-card qz-quiz" key={course.id}>
                <span style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <Link to={pageHref(host, `course/${Q(course.id)}`)} style={{ display: 'block', fontWeight: 600 }}>
                    {course.title}
                  </Link>
                  <span className="qz-muted qz-small">
                    {t(average === null ? 'quizzesTaken' : 'quizzesTakenAverage', {
                      taken: taken.length,
                      quizzes: t(quizzes.length === 1 ? 'quizCountOne' : 'quizCount', { n: quizzes.length }),
                      percent: asPercent(average),
                    })}
                  </span>
                  <div className="qz-progress" role="progressbar" aria-valuenow={taken.length} aria-valuemin={0} aria-valuemax={quizzes.length} aria-label={t('progressIn', { title: course.title })}>
                    <div style={{ width: `${(taken.length / Math.max(1, quizzes.length)) * 100}%` }} />
                  </div>
                </span>
                <Link className="qz-btn secondary" to={pageHref(host, `course/${Q(course.id)}/progress`)}>
                  {t('seeMyScores')}
                </Link>
              </div>
            );
          })}
        </div>
      </Page>
    </Surface>
  );
}

// ---- a course ---------------------------------------------------------------------------------------

function LinkPills({ links, editable, onChange, label, picks }: { links: string[]; editable: boolean; onChange: (next: string[]) => void; label: string; picks: Pickable | null }): JSX.Element {
  const { t } = usePluginHost();
  return (
    <>
      {links.map((held) => (
        <span className="qz-pill" key={held}>
          {picks?.groups.includes(held) ? `${held}/*` : held}
          {editable && (
            <button aria-label={t('removeSource', { source: held })} onClick={() => onChange(links.filter((link) => link !== held))}>
              ×
            </button>
          )}
        </span>
      ))}
      {links.length === 0 && !editable && <Text tone="faint">{t('none')}</Text>}
      {editable && (
        <span className="qz-add">
          <Select aria-label={label} value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && onChange([...links, event.target.value])}>
            <option value="" hidden>
              {label}
            </option>
            {(picks?.groups ?? [])
              .filter((held) => !links.includes(held))
              .map((held) => (
                <option key={held} value={held}>
                  {held}/*
                </option>
              ))}
            {(picks?.blueprints ?? [])
              .filter((held) => !links.includes(held.id))
              .map((held) => (
                <option key={held.id} value={held.id}>
                  {held.id} {held.title}
                </option>
              ))}
          </Select>
        </span>
      )}
    </>
  );
}

// One enrolled person's way through a course: which quizzes they have taken, and every score.
function ProgressDetail({ course, person }: { course: string; person: string | null }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const { data, error } = useData<ProgressView>(`course/progress?id=${Q(course)}${person ? `&person=${Q(person)}` : ''}`);
  const [open, setOpen] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState<{ quiz: string; attempt: string } | null>(null);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Loading />;
  const { progress } = data;
  return (
    <>
      {!data.mine && (
        <div className="qz-row" style={{ marginBottom: 12 }}>
          <h2 className="qz-h2" style={{ margin: 0 }}>
            {data.person.name}
          </h2>
          <span className="qz-muted qz-small">{t('enrolledOn', { date: formatDate(data.enrolled_since) })}</span>
        </div>
      )}
      <div className="qz-stats">
        <Stat hero label={t('progress')} value={t('xOfY', { n: progress.taken, of: progress.of })} sub={data.enrolled_since === null ? t('quizzesTakenSub') : t('quizzesTakenOfficially')} />
        <Stat label={t('averageBest')} value={asPercent(progress.average_best)} sub={t('acrossQuizzesTaken')} />
        <Stat
          label={t('lastTaken')}
          value={<span style={{ fontSize: 26 }}>{formatDate(progress.last_taken)}</span>}
          sub={data.enrolled_since === null ? t('onThisMachine') : data.mine ? t('enrolledOn', { date: formatDate(data.enrolled_since) }) : t('anOfficialAttempt')}
        />
        {data.sessions > 0 && <Stat label={t('studyPlan')} value={t('xOfY', { n: data.sessions_done, of: data.sessions })} sub={t('sessionsDone')} />}
      </div>
      <div className="qz-scroll">
        <table className="qz-table">
          <thead>
            <tr>
              <th>{t('quiz')}</th>
              <th className="num">{t('best')}</th>
              <th className="num">{t('latest')}</th>
              <th className="num">{t('attempts')}</th>
              <th>{t('lastTaken')}</th>
            </tr>
          </thead>
          <tbody>
            {progress.quizzes.flatMap((row) => {
              const showing = open.includes(row.id);
              return [
                <tr key={row.id}>
                  <td>
                    <span className="qz-badge accent" style={{ marginRight: 8 }}>
                      {row.place}
                    </span>
                    <button className="qz-rowlink" onClick={() => host.navigate(pageHref(host, `quiz/${Q(row.id)}`))}>
                      {row.title}
                    </button>
                    {row.status === 'closed' && (
                      <>
                        {' '}
                        <span className="qz-badge">{t('closed')}</span>
                      </>
                    )}
                  </td>
                  <td className="num">{row.best !== null ? asPercent(row.best) : <Text tone="faint">{row.waiting ? t('waitingForGrade') : t('notYet')}</Text>}</td>
                  <td className="num">{row.latest === null ? <Text tone="faint">-</Text> : asPercent(row.latest)}</td>
                  <td className="num">
                    {row.attempts === 0 ? (
                      <Text tone="faint">0</Text>
                    ) : (
                      <button
                        className="qz-toggle"
                        aria-expanded={showing}
                        aria-label={t(row.attempts === 1 ? 'attemptsOnOne' : 'attemptsOn', { n: row.attempts, title: row.title })}
                        onClick={() => setOpen(showing ? open.filter((held) => held !== row.id) : [...open, row.id])}
                      >
                        {row.attempts} {showing ? '▴' : '▾'}
                      </button>
                    )}
                  </td>
                  <td>{row.last_taken ? formatDate(row.last_taken) : <Text tone="faint">-</Text>}</td>
                </tr>,
                ...(showing
                  ? [
                      <tr className="qz-attempts-row" key={`${row.id}/attempts`}>
                        <td colSpan={5}>
                          {row.history.map((attempt) => (
                            <div className="qz-attempt" key={attempt.id}>
                              <span>{formatDate(attempt.completed_at)}</span>
                              <span>
                                {attempt.score}/{attempt.total} ({asPercent(attempt.percent)})
                              </span>
                              <button onClick={() => setReviewing({ quiz: row.id, attempt: attempt.id })}>{t('reviewAnswers')}</button>
                            </div>
                          ))}
                        </td>
                      </tr>,
                    ]
                  : []),
              ];
            })}
            {progress.quizzes.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Text tone="muted">{t('courseNoQuizzes')}</Text>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="qz-muted qz-small" style={{ marginTop: 8 }}>
        {t('officialOnlyNote')}
      </p>
      {reviewing && (
        <AttemptModal quiz={reviewing.quiz} attempt={reviewing.attempt} title={data.mine ? t('review') : data.person.name} {...(data.mine ? {} : { chose: t('chose') })} onClose={() => setReviewing(null)} />
      )}
    </>
  );
}

// Everyone enrolled in a course, each opening their ProgressDetail.
function EnrolledTab({ course }: { course: string }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const { data, error } = useData<RosterView>(`course/people?id=${Q(course)}`);
  const [search, setSearch] = useState('');
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Loading />;
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const people = data.people.filter((person) => words.every((word) => `${person.name} ${person.alias}`.toLowerCase().includes(word)));
  return (
    <>
      <div className="qz-stats">
        <Stat hero label={t('enrolled')} value={data.people.length} sub={data.people.length === 1 ? t('peopleInCourseOne') : t('peopleInCourse')} />
        <Stat label={t('averageBest')} value={asPercent(data.average_best)} sub={t('acrossPeopleTaken')} />
      </div>
      <Input aria-label={t('searchPeople')} placeholder={t('searchPeople')} value={search} onChange={(event: { target: HTMLInputElement }) => setSearch(event.target.value)} />
      <div className="qz-scroll" style={{ marginTop: 10 }}>
        <table className="qz-table">
          <thead>
            <tr>
              <th>{t('person')}</th>
              <th>{t('progress')}</th>
              <th className="num">{t('averageBest')}</th>
              <th>{t('lastTaken')}</th>
              <th>{t('enrolled')}</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.alias}>
                <td>
                  <button className="qz-rowlink" onClick={() => host.navigate(pageHref(host, `course/${Q(course)}/people/${Q(person.alias)}`))}>
                    {person.name}
                  </button>
                </td>
                <td>
                  {t('xOfY', { n: person.taken, of: person.of })}
                  <div className="qz-progress qz-minibar" role="progressbar" aria-valuenow={person.taken} aria-valuemin={0} aria-valuemax={person.of} aria-label={t('personProgress', { name: person.name })}>
                    <div style={{ width: `${(person.taken / Math.max(1, person.of)) * 100}%` }} />
                  </div>
                </td>
                <td className="num">{person.average_best === null ? <Text tone="faint">{t('notYet')}</Text> : asPercent(person.average_best)}</td>
                <td>{person.last_taken ? formatDate(person.last_taken) : <Text tone="faint">-</Text>}</td>
                <td>{formatDate(person.since)}</td>
              </tr>
            ))}
            {people.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Text tone="muted">{data.people.length === 0 ? t('nobodyEnrolled') : t('nobodyMatches')}</Text>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Words edited where they stand: pressed, they become a field in the same type. Enter (⌘Enter over several lines)
// or leaving the field saves, Escape puts them back, and to anyone who may not edit them they are plain words.
function InlineText(props: {
  value: string;
  editable: boolean;
  onSave: (value: string) => void;
  label: string;
  as: 'h1' | 'p';
  className: string;
  multiline?: boolean;
  placeholder?: string;
}): JSX.Element | null {
  const { as: Tag, value, editable, onSave, multiline } = props;
  const { t } = usePluginHost();
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const cancelled = useRef(false);
  const editing = draft !== null;
  // focused by hand: the page's autofocus takes only once a document
  useEffect(() => {
    if (!editing) return;
    cancelled.current = false;
    field.current?.focus();
  }, [editing]);
  if (draft === null) {
    if (!editable) return value ? <Tag className={props.className}>{value}</Tag> : null;
    return (
      <Tag className={props.className}>
        <button type="button" className="qz-inline" aria-label={t('inlineEdit', { label: props.label, value: value || t('inlineNone') })} onClick={() => setDraft(value)}>
          {value || <span className="qz-inline-empty">{props.placeholder}</span>}
        </button>
      </Tag>
    );
  }
  const finish = (): void => {
    if (cancelled.current) return;
    const next = draft.trim();
    setDraft(null);
    if (next !== value) onSave(next);
  };
  const shared = {
    ref: field,
    'aria-label': props.label,
    className: `${props.className} qz-inline-field`,
    value: draft,
    placeholder: props.placeholder,
    onBlur: finish,
    onFocus: (event: { target: HTMLInputElement | HTMLTextAreaElement }) => event.target.select(),
    onChange: (event: { target: HTMLInputElement | HTMLTextAreaElement }) => setDraft(event.target.value),
    onKeyDown: (event: { key: string; metaKey: boolean; ctrlKey: boolean; preventDefault: () => void; currentTarget: HTMLElement }) => {
      if (event.key === 'Escape') {
        // nothing is saved as the field goes
        cancelled.current = true;
        setDraft(null);
      } else if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.currentTarget.blur();
      }
    },
  };
  return multiline ? <textarea rows={Math.max(2, draft.split('\n').length)} {...shared} /> : <input {...shared} />;
}

function CoursePage({ id, tab, person }: { id: string; tab: string; person: string | null }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const act = useAct();
  const { data, error, reload } = useData<CourseView>(`course?id=${Q(id)}`);
  const { data: picks } = useData<Pickable>('pickable');
  const { data: overview } = useData<Overview>('overview');
  const [adding, setAdding] = useState<'quiz' | 'deck' | null>(null);
  useTrail(
    data
      ? [
          { label: t('academy'), href: pageHref(host, '') },
          ...(person ? [{ label: data.course.title, href: pageHref(host, `course/${Q(id)}/people`) }, { label: `@${person}` }] : [{ label: data.course.title }]),
        ]
      : null,
  );
  if (error) return <Failed message={error} />;
  if (!data) return <Loading />;
  const { course, quizzes, decks, items, progress } = data;
  const patch = (body: Record<string, unknown>): void => {
    void act(t('changeCourseFailed'), async () => {
      await host.put(`course?id=${Q(id)}`, body);
      reload();
    });
  };
  const move = (from: number, to: number): void => {
    const ids = items.map((placed) => placed.row.id);
    const [held] = ids.splice(from, 1);
    ids.splice(to, 0, held!);
    void act(t('reorderCourseFailed'), async () => {
      await host.put(`course/order?id=${Q(id)}`, { ids });
      reload();
    });
  };
  const enroll = (): void => {
    void act(t('enrollFailed'), async () => {
      await host.post(`course/enroll?id=${Q(id)}`);
      reload();
    });
  };
  const leave = async (): Promise<void> => {
    if (!(await host.dialog.confirm(t('leaveCourseAsk', { title: course.title }), { title: t('leaveCourse'), ok: t('leave') }))) return;
    await act(t('leaveCourseFailed'), async () => {
      await host.del(`course/enroll?id=${Q(id)}`);
      host.navigate(pageHref(host, `course/${Q(id)}`));
      reload();
    });
  };
  // a course kept just for the person follows them without enrolling (Academy REQ79)
  const enrolled = data.enrolled_since !== null || course.local;
  const share = async (): Promise<void> => {
    if (await shareWithProject(host, act, { kind: 'course', id: course.id, title: course.title, holds: quizzes.length + decks.length })) reload();
  };
  const keep = async (): Promise<void> => {
    if (await keepJustForMe(host, act, { kind: 'course', id: course.id, title: course.title })) reload();
  };
  const tabs: Array<{ name: string; label: string; show: boolean }> = [
    { name: '', label: decks.length > 0 ? t('quizzesAndDecks') : t('quizzes'), show: true },
    { name: 'progress', label: t('myProgress'), show: enrolled },
    { name: 'people', label: t('enrolledTab', { n: data.enrolled_people }), show: data.may.people },
  ];
  const active = tabs.find((held) => held.name === tab && held.show)?.name ?? '';
  const remove = async (): Promise<void> => {
    const words = t(course.local ? 'deleteLocalCourseAsk' : 'deleteCourseAsk', {
      title: course.title,
      quizzes: t(quizzes.length === 1 ? 'quizCountOne' : 'quizCount', { n: quizzes.length }),
      decks: t(decks.length === 1 ? 'deckCountOne' : 'deckCount', { n: decks.length }),
    });
    if (!(await host.dialog.confirm(words, { title: t('deleteCourse'), ok: t('delete'), danger: true }))) return;
    await act(t('deleteCourseFailed'), async () => {
      await host.del(`course?id=${Q(id)}`);
      host.navigate(pageHref(host, ''));
    });
  };
  return (
    <Surface>
      <Page>
        <div className="qz">
          {course.local ? <LocalChip /> : <span className="qz-eyebrow">{t('course')}</span>}
          <div className="qz-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 400px', minWidth: 0 }}>
              <InlineText className="qz-h1" as="h1" label={t('courseName')} value={course.title} editable={data.may.edit} onSave={(title) => title.trim() !== '' && patch({ title })} />
            </div>
            <span className="qz-head-actions">
              {enrolled && !course.local && <span className="qz-badge good">{t('enrolled')}</span>}
              {enrolled && !course.local && (
                <Button size="sm" variant="quiet" onClick={leave}>
                  {t('leaveCourse')}
                </Button>
              )}
              {data.may.edit && (
                <>
                  <button className="qz-btn secondary" onClick={() => setAdding('quiz')}>
                    {t('addQuiz')}
                  </button>
                  <button className="qz-btn secondary" onClick={() => setAdding('deck')}>
                    {t('addDeck')}
                  </button>
                </>
              )}
              {course.local && (
                <Button size="sm" onClick={share}>
                  {t('shareWithProject')}
                </Button>
              )}
              {course.local && data.may.edit && (
                <Button size="sm" variant="quiet" onClick={remove}>
                  {t('delete')}
                </Button>
              )}
              {!course.local && (data.may.edit || data.may.keep) && (
                <HeadMenu
                  items={[
                    ...(data.may.keep ? [{ label: t('keepJustForMe'), run: keep, ...(data.may.keep_why ? { disabled: t('keepWhyStays', { why: data.may.keep_why }) } : {}) }] : []),
                    ...(data.may.edit ? [{ label: t('delete'), run: remove, danger: true, rule: data.may.keep }] : []),
                  ]}
                />
              )}
            </span>
          </div>
          <InlineText
            className="qz-course-description qz-muted"
            as="p"
            multiline
            label={t('courseDescription')}
            placeholder={t('addDescription')}
            value={course.description}
            editable={data.may.edit}
            onSave={(description) => patch({ description })}
          />
          <dl className="qz-props">
            <dt>{t('content')}</dt>
            <dd>
              <LinkPills links={course.content} editable={data.may.edit} label={t('addContent')} picks={picks} onChange={(content) => patch({ content })} />
            </dd>
            <dt>{t('studyPlan')}</dt>
            <dd>
              <LinkPills links={course.study_plan} editable={data.may.edit} label={t('addStudyPlan')} picks={picks} onChange={(study_plan) => patch({ study_plan })} />
              {course.study_plan.length === 0 && data.may.edit && (
                <Ask
                  label={t('buildStudyPlan')}
                  title={t('studyPlanChatTitle', { title: course.title })}
                  text={studyPlanText(`the course ${course.id}, "${course.title}" (its content: ${course.content.join(', ') || 'ask me'})`)}
                />
              )}
            </dd>
            {!course.local && (
              <>
                <dt>{t('createdBy')}</dt>
                <dd>
                  {course.created_by ? <UserPill alias={course.created_by} name={data.created_by_name} /> : <Text tone="faint">{t('unknown')}</Text>}
                  {data.may.edit && (
                    <span className="qz-add">
                      <Select aria-label={t('changeCreator')} value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && patch({ created_by: event.target.value })}>
                        <option value="" hidden>
                          {course.created_by ? t('changePick') : t('setCreatorPick')}
                        </option>
                        {data.people
                          .filter((person) => person.alias !== course.created_by)
                          .map((person) => (
                            <option key={person.alias} value={person.alias}>
                              {person.name} (@{person.alias})
                            </option>
                          ))}
                      </Select>
                    </span>
                  )}
                </dd>
              </>
            )}
          </dl>
          {tabs.filter((held) => held.show).length > 1 && (
            <nav className="qz-tabs">
              {tabs
                .filter((held) => held.show)
                .map((held) => (
                  <Link key={held.name} className="qz-tab" to={pageHref(host, `course/${Q(id)}${held.name ? `/${held.name}` : ''}`)} aria-current={held.name === active ? 'page' : undefined}>
                    {held.label}
                  </Link>
                ))}
            </nav>
          )}
          {active === 'progress' && <ProgressDetail course={id} person={null} />}
          {active === 'people' &&
            (person ? (
              <>
                <p style={{ margin: '0 0 12px' }}>
                  <Link className="qz-link qz-small" to={pageHref(host, `course/${Q(id)}/people`)}>
                    {t('everyoneEnrolled')}
                  </Link>
                </p>
                <ProgressDetail key={person} course={id} person={person} />
              </>
            ) : (
              <EnrolledTab course={id} />
            ))}
          {active === '' && (
            <>
              {enrolled ? (
                <div className="qz-stats">
                  <Stat
                    hero
                    label={t('yourProgress')}
                    value={t('xOfY', { n: progress.taken, of: progress.of })}
                    sub={
                      <Link className="qz-link" to={pageHref(host, `course/${Q(id)}/progress`)}>
                        {t('seeYourScores')}
                      </Link>
                    }
                  />
                  <Stat label={t('yourAverageBest')} value={asPercent(progress.average_best)} sub={t('acrossQuizzesTaken')} />
                  {progress.sessions > 0 && <Stat label={t('studyPlan')} value={t('xOfY', { n: progress.sessions_done, of: progress.sessions })} sub={t('sessionsDone')} />}
                </div>
              ) : (
                <div className="qz-card qz-enroll">
                  <div className="qz-row">
                    <strong>{t('trackYourProgress')}</strong>
                    <button className="qz-btn" disabled={!data.may.enroll} title={data.may.enroll_why ?? undefined} onClick={enroll}>
                      {t('enroll')}
                    </button>
                  </div>
                  <div className="qz-muted qz-small" style={{ marginTop: 4 }}>
                    {t(progress.taken === 0 ? 'enrollHint' : progress.taken === 1 ? 'enrollHintTakenOne' : 'enrollHintTaken', { n: progress.taken })}
                  </div>
                </div>
              )}
              {decks.length > 0 && (
                <div className="qz-stats">
                  <Stat
                    label={t('cardsLearned')}
                    value={t('xOfY', { n: progress.cards_learned, of: progress.cards })}
                    sub={t('acrossDecks', { decks: t(decks.length === 1 ? 'deckCountOne' : 'deckCount', { n: decks.length }) })}
                  />
                  <Stat
                    label={t('stillLearning')}
                    value={progress.cards_learning}
                    sub={
                      <Link className="qz-link" to={`${pageHref(host, 'study')}?course=${Q(id)}`}>
                        {t('studyCourseCards')}
                      </Link>
                    }
                  />
                </div>
              )}
              <h2 className="qz-h2">{decks.length > 0 ? t('courseInOrder') : t('quizzesInOrder')}</h2>
              {items.length === 0 && <Empty>{t('courseEmpty')}</Empty>}
              {items.map((placed, index) => {
                const { row } = placed;
                const page = pageHref(host, `${placed.kind}/${Q(row.id)}`);
                return (
                  <div className="qz-card qz-quiz" key={row.id}>
                    {data.may.edit && (
                      <span className="qz-move">
                        <button aria-label={t('moveUp', { title: row.title })} disabled={index === 0} onClick={() => move(index, index - 1)}>
                          ▲
                        </button>
                        <button aria-label={t('moveDown', { title: row.title })} disabled={index === items.length - 1} onClick={() => move(index, index + 1)}>
                          ▼
                        </button>
                      </span>
                    )}
                    <span className="qz-badge accent">{index + 1}</span>
                    {decks.length > 0 && <span className={`qz-badge${placed.kind === 'deck' ? ' good' : ''}`}>{placed.kind === 'deck' ? t('deck') : t('quiz')}</span>}
                    <span style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <Link to={page} style={{ display: 'block', fontWeight: 600 }}>
                        {row.title}
                      </Link>
                      <span className="qz-muted qz-small">
                        {(() => {
                          const size =
                            placed.kind === 'quiz'
                              ? t(placed.row.questions === 1 ? 'questionCountOne' : 'questionCount', { n: placed.row.questions })
                              : t(placed.row.cards === 1 ? 'cardCountOne' : 'cardCount', { n: placed.row.cards });
                          return row.draws_from.length > 0 ? t('sizeDrawsFrom', { size, sources: row.draws_from.join(t('listAnd')) }) : size;
                        })()}
                      </span>
                    </span>
                    {placed.kind === 'quiz' ? (
                      <>
                        <span className={`qz-badge${placed.row.best === null && placed.row.waiting ? ' accent' : ''}`}>
                          {placed.row.best !== null ? t('bestPercent', { percent: asPercent(placed.row.best) }) : placed.row.waiting ? t('waitingForGrade') : t('notYet')}
                        </span>
                        {row.status === 'closed' ? (
                          <span className="qz-badge">{t('closed')}</span>
                        ) : (
                          <Link className={`qz-btn${placed.row.best === null && !placed.row.waiting ? '' : ' secondary'}`} to={page}>
                            {placed.row.best === null && !placed.row.waiting ? t('take') : t('retake')}
                          </Link>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="qz-badge">{placed.row.learned + placed.row.learning === 0 ? t('notYet') : t('learnedOf', { learned: placed.row.learned, of: placed.row.cards })}</span>
                        {row.status === 'closed' ? (
                          <span className="qz-badge">{t('closed')}</span>
                        ) : (
                          <Link className="qz-btn" to={`${pageHref(host, 'study')}?deck=${Q(row.id)}`}>
                            {t('study')}
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              <p className="qz-muted qz-small">{t('courseOrderHint')}</p>
              {data.sessions.length > 0 && (
                <>
                  <h2 className="qz-h2">{t('studyPlan')}</h2>
                  {data.sessions.map((session) => (
                    <div className="qz-row" key={session.id} style={{ padding: '6px 0' }}>
                      <a className="qz-link" href={host.hrefs.blueprint(session.rel)}>
                        {session.title}
                      </a>
                      <span className="qz-badge">{session.done ? t('done') : t('notYet')}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </Page>
      {adding === 'quiz' && <NewQuiz onClose={() => setAdding(null)} courses={overview?.courses ?? [{ id: course.id, title: course.title, local: course.local }]} draws={[]} course={course.id} />}
      {adding === 'deck' && (
        <NewDeck
          onClose={() => setAdding(null)}
          courses={overview?.courses ?? [{ id: course.id, title: course.title, local: course.local }]}
          quizzes={overview?.quizzes ?? []}
          draws={[]}
          course={course.id}
          fromQuiz={null}
        />
      )}
    </Surface>
  );
}

// ---- a quiz and its tabs -------------------------------------------------------------------------------

function Chart({ points }: { points: MyScores['over_time'] }): JSX.Element {
  const { t } = usePluginHost();
  const [width, top, bottom] = [800, 20, 170];
  const x = (index: number): number => (points.length === 1 ? 420 : 80 + (index * (width - 120)) / (points.length - 1));
  const y = (fraction: number): number => bottom - fraction * (bottom - top);
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(point.percent)}`).join('');
  const labels = points.filter((_, index) => points.length <= 8 || index % Math.ceil(points.length / 8) === 0 || index === points.length - 1);
  return (
    <div className="qz-card">
      <svg viewBox={`0 0 ${width} 210`} width="100%" role="img" aria-label={t('scoresOverTimeLabel', { scores: points.map((point) => asPercent(point.percent)).join(', ') })}>
        <path d={`M44 ${top}H790M44 95H790M44 ${bottom}H790`} stroke="var(--color-line)" fill="none" />
        <g fill="var(--color-muted)" fontSize="14">
          <text x="0" y={top + 5}>
            100%
          </text>
          <text x="6" y="100">
            50%
          </text>
          <text x="14" y={bottom + 5}>
            0%
          </text>
        </g>
        {points.length > 1 && <path d={`${line}V${bottom}H${x(0)}Z`} fill="var(--color-accent-soft)" />}
        <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
        {points.map((point, index) => (
          <circle key={point.completed_at} cx={x(index)} cy={y(point.percent)} r="5" fill="var(--color-accent)" stroke="var(--color-raised)" strokeWidth="2">
            <title>{`${point.score}/${point.total}, ${formatDate(point.completed_at)}`}</title>
          </circle>
        ))}
        <g fill="var(--color-muted)" fontSize="14" textAnchor="middle">
          {labels.map((point) => (
            <text key={point.completed_at} x={x(points.indexOf(point))} y="198">
              {formatDate(point.completed_at)}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}

function Review({ attempt, chose, references = [] }: { attempt: Attempt; chose?: string; references?: Referenced[] }): JSX.Element {
  const { t } = usePluginHost();
  return (
    <>
      {attempt.answers.map((answer) => {
        const { question } = answer;
        const waiting = answer.earned === null;
        const right = !waiting && answer.earned! >= question.points;
        // a written answer can earn part of its points
        const partly = !waiting && !right && answer.earned! > 0;
        const points = t(question.points === 1 ? 'pointsOfOne' : 'pointsOf', { earned: answer.earned ?? '…', n: question.points });
        return (
          <div className="qz-review" key={question.id}>
            <span className={waiting || partly ? 'qz-muted' : right ? 'qz-yes' : 'qz-no'} aria-label={waiting ? t('waitingForGrade') : right ? t('right') : partly ? t('partOfPoints') : t('wrong')}>
              {waiting ? '…' : right ? '✓' : partly ? '◐' : '✗'}
            </span>{' '}
            {question.prompt} {waiting && <span className="qz-badge accent">{t('waitingForGrade')}</span>}
            {(question.type === 'written' || !right) && (
              <div className="qz-small">
                {chose ?? t('youGave')}: {responseWords(t, question, answer.response)}
              </div>
            )}
            <div className="qz-muted qz-small">
              {question.type === 'written' ? t('modelAnswer') : t('answer')}: {answerWords(t, question)} · {points}
            </div>
            {answer.grade && (
              <div className="qz-small">
                {t(answer.grade.ai ? 'gradedByAi' : 'gradedBy', { points: answer.grade.points, of: question.points, by: answer.grade.by })}
                {answer.grade.note ? `: ${answer.grade.note}` : ''}
              </div>
            )}
            {answer.self_marked !== undefined && <div className="qz-muted qz-small">{answer.self_marked ? t('youMarkedRight') : t('youMarkedNotQuite')}</div>}
            {question.why && <div className="qz-muted qz-small">{question.why}</div>}
            <ReferenceLine reference={question.reference} references={references} />
          </div>
        );
      })}
    </>
  );
}

function AttemptModal({ quiz, attempt, title, chose, onClose }: { quiz: string; attempt: string; title: string; chose?: string; onClose: () => void }): JSX.Element {
  const { t } = usePluginHost();
  const { data, error } = useData<Attempt>(`attempt?id=${Q(quiz)}&attempt=${Q(attempt)}`);
  return (
    <Modal title={title} size="lg" onClose={onClose}>
      <div className="qz" style={{ padding: 0 }}>
        {error && <Notice tone="error">{error}</Notice>}
        {data && (
          <>
            <div className="qz-stats">
              <Stat
                hero
                label={t('score')}
                value={(data.waiting ?? 0) > 0 ? `${data.score}` : asPercent(data.score / data.total)}
                sub={(data.waiting ?? 0) > 0 ? t('pointsSoFar', { n: data.waiting ?? 0 }) : t(data.total === 1 ? 'pointsOfOne' : 'pointsOf', { earned: data.score, n: data.total })}
              />
              <Stat label={t('when')} value={<span style={{ fontSize: 26 }}>{formatDate(data.completed_at)}</span>} sub={data.kind === 'official' ? t('officialAttempt') : t('practiceLocal')} />
            </div>
            <Review attempt={data} {...(chose ? { chose } : {})} />
          </>
        )}
      </div>
    </Modal>
  );
}

// the catalog's key for each way through a quiz
const modeWords: Record<AttemptMode, string> = { whole: 'modeWhole', missed: 'modeMissed', unseen: 'modeUnseen' };

function MyScoresTab({ view }: { view: QuizView }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const { scores, practice, quiz, askable } = view;
  const [reviewing, setReviewing] = useState<string | null>(null);
  const take = (kind: AttemptKind, mode: AttemptMode): string => `${pageHref(host, `take/${Q(quiz.id)}`)}?kind=${kind}&mode=${mode}`;
  // a quiz kept just for the person has one way in, and its whole attempts are its scores (Academy REQ77)
  const official = !quiz.local;
  const retries = (
    <>
      {practice.missed.length > 0 ? (
        <Link className="qz-btn secondary" to={take('practice', 'missed')}>
          {t('retryMissed', { n: practice.missed.length })}
        </Link>
      ) : (
        <button className="qz-btn secondary" disabled>
          {t('retryMissed', { n: 0 })}
        </button>
      )}
      {practice.unseen.length > 0 ? (
        <Link className="qz-btn secondary" to={take('practice', 'unseen')}>
          {t('notYetSeenCount', { n: practice.unseen.length })}
        </Link>
      ) : (
        <button className="qz-btn secondary" disabled>
          {t('notYetSeenCount', { n: 0 })}
        </button>
      )}
    </>
  );
  return (
    <>
      {scores.official_attempts > 0 && (
        <div className="qz-stats">
          <Stat
            hero
            label={official ? t('bestOfficial') : t('best')}
            value={asPercent(scores.best?.percent)}
            sub={t('scoreOfOn', { score: scores.best?.score ?? '', total: scores.best?.total ?? '', date: formatDate(scores.best?.completed_at) })}
          />
          <Stat
            label={official ? t('latestOfficial') : t('latest')}
            value={asPercent(scores.latest?.percent)}
            sub={
              scores.latest?.change === null ? (
                quiz.local ? (
                  t('firstTimeThrough')
                ) : (
                  t('firstOfficialAttempt')
                )
              ) : (
                <Delta change={scores.latest?.change} suffix={t('vsYourLastTry')} same={t('sameAsYourLastTry')} />
              )
            }
          />
          <Stat label={quiz.local ? t('attempts') : t('officialAttempts')} value={scores.official_attempts} sub={t('since', { date: formatDate(scores.first_official) })} />
        </div>
      )}
      {askable === 0 ? (
        <Empty>{t('quizNoQuestions')}</Empty>
      ) : quiz.local ? (
        <div className="qz-card">
          <div className="qz-row">
            <strong>{t('takeTheQuiz')}</strong>
            <span className="qz-badge">
              <LaptopMark /> {t('local')}
            </span>
          </div>
          <div className="qz-muted qz-small" style={{ marginTop: 4 }}>
            {t('localAttemptsHint')}
          </div>
          <div className="qz-actions">
            <Link className="qz-btn" to={take('practice', 'whole')}>
              {t('takeQuiz')}
            </Link>
            {retries}
          </div>
        </div>
      ) : quiz.status === 'closed' && !view.may.edit ? (
        <Empty>{t('quizClosedTakeLater')}</Empty>
      ) : (
        <div className="qz-grid">
          <div className="qz-card">
            <div className="qz-row">
              <strong>{t('officialAttempt')}</strong>
              <span className="qz-badge accent">{t('shared')}</span>
            </div>
            <div className="qz-muted qz-small" style={{ marginTop: 4 }}>
              {t('officialAttemptHint')}
            </div>
            <div className="qz-actions">
              {view.may.take_official && quiz.status === 'open' ? (
                <Link className="qz-btn" to={take('official', 'whole')}>
                  {t('takeOfficially')}
                </Link>
              ) : (
                <button className="qz-btn" disabled title={quiz.status === 'closed' ? t('openToTakeOfficially') : (view.may.official_why ?? undefined)}>
                  {t('takeOfficially')}
                </button>
              )}
            </div>
          </div>
          <div className="qz-card">
            <div className="qz-row">
              <strong>{t('practice')}</strong>
              <span className="qz-badge">
                <LaptopMark /> {t('local')}
              </span>
            </div>
            <div className="qz-muted qz-small" style={{ marginTop: 4 }}>
              {quiz.status === 'closed' ? t('practiceClosedHint') : t('practiceHint')}
            </div>
            <div className="qz-actions">
              <Link className="qz-btn secondary" to={take('practice', 'whole')}>
                {t('wholeQuiz')}
              </Link>
              {retries}
            </div>
          </div>
        </div>
      )}
      {scores.over_time.length > 0 && (
        <>
          <h2 className="qz-h2">{t('scoresOverTime')}</h2>
          <Chart points={scores.over_time} />
        </>
      )}
      <h2 className="qz-h2">{t('history')}</h2>
      <div className="qz-scroll">
        <table className="qz-table">
          <thead>
            <tr>
              <th>{t('when')}</th>
              <th>{t('quiz')}</th>
              <th className="num">{t('score')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {scores.history.map((attempt) => (
              <tr key={attempt.id}>
                <td>{formatDate(attempt.completed_at)}</td>
                <td>
                  {quiz.local ? (
                    t('theMode', { mode: t(modeWords[attempt.mode]) })
                  ) : attempt.kind === 'official' ? (
                    t('official')
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <LaptopMark /> {t('practiceMode', { mode: t(modeWords[attempt.mode]) })}
                    </span>
                  )}
                </td>
                <td className="num">
                  {attempt.waiting > 0 ? (
                    <span className="qz-badge accent">{t('waitingCount', { n: attempt.waiting })}</span>
                  ) : (
                    <>
                      {attempt.score}/{attempt.total} ({asPercent(attempt.percent)})
                    </>
                  )}
                </td>
                <td className="num">
                  <button className="qz-rowlink qz-small" style={{ color: 'var(--color-accent)' }} onClick={() => setReviewing(attempt.id)}>
                    {t('review')}
                  </button>
                </td>
              </tr>
            ))}
            {scores.history.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <Text tone="muted">{quiz.local ? t('noAttemptsYet') : t('noAttemptsYetTake')}</Text>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {reviewing && <AttemptModal quiz={quiz.id} attempt={reviewing} title={t('review')} onClose={() => setReviewing(null)} />}
    </>
  );
}

function CompareTab({ id }: { id: string }): JSX.Element {
  const { t } = usePluginHost();
  const { data, error } = useData<Comparison>(`compare?id=${Q(id)}`);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Loading />;
  if (data.people === 0) return <Empty>{t('compareEmpty')}</Empty>;
  const most = Math.max(1, ...data.bands.map((band) => band.count));
  return (
    <>
      <div className="qz-stats">
        <Stat
          hero
          label={t('yourLatest')}
          value={asPercent(data.mine)}
          sub={data.mine === null ? t('notTakenOfficially') : <Delta change={data.mine - (data.average ?? 0)} suffix={t('vsQuizAverage')} same={t('sameAsQuizAverage')} />}
        />
        <Stat label={t('quizAverage')} value={asPercent(data.average)} sub={t('latestOfficialAttempts')} />
        <Stat label={t('people')} value={data.people} sub={t('tookItOfficially')} />
      </div>
      <h2 className="qz-h2">{t('whereYouSit')}</h2>
      <div className="qz-card">
        <div className="qz-bars" role="img" aria-label={data.bands.map((band) => t(band.mine ? 'bandCountYou' : 'bandCount', { label: band.label, n: band.count })).join('; ')}>
          {data.bands.map((band) => (
            <div className={`qz-bar${band.mine ? ' mine' : ''}`} key={band.label}>
              {band.count}
              <i style={{ height: `${(band.count / most) * 80}%` }} />
            </div>
          ))}
        </div>
        <div className="qz-barlabels">
          {data.bands.map((band) => (
            <span className={band.mine ? 'mine' : undefined} key={band.label}>
              {band.mine ? t('bandYou', { label: band.label }) : band.label}
            </span>
          ))}
        </div>
      </div>
      <p className="qz-muted qz-small" style={{ marginTop: 10 }}>
        {t('totalsOnly')}
      </p>
    </>
  );
}

// each label is the catalog's key for it
const GUEST_NAME_CHOICES: Array<[GuestName, string]> = [
  ['required', 'guestNameRequired'],
  ['optional', 'guestNameOptional'],
  ['none', 'guestNameNone'],
];

function ResultsTab({ view }: { view: QuizView }): JSX.Element {
  const { t } = usePluginHost();
  const { data, error } = useData<ResultsView>(`results?id=${Q(view.quiz.id)}`);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<(ResultsView['people'][number] & { attempt: string }) | null>(null);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Loading />;
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const people = data.people.filter((person) => words.every((word) => `${person.name} ${person.alias}`.toLowerCase().includes(word)));
  return (
    <>
      <div className="qz-stats">
        <Stat hero label={t('quizAverage')} value={asPercent(data.summary.average)} sub={t('latestOfficialAttempts')} />
        <Stat label={t('people')} value={data.summary.people} sub={t('tookItOfficially')} />
        <Stat label={t('officialAttempts')} value={data.attempts} sub={data.first ? t('since', { date: formatDate(data.first) }) : t('noneYet')} />
      </div>
      <Input aria-label={t('searchPeople')} placeholder={t('searchPeople')} value={search} onChange={(event: { target: HTMLInputElement }) => setSearch(event.target.value)} />
      <div className="qz-scroll" style={{ marginTop: 10 }}>
        <table className="qz-table">
          <thead>
            <tr>
              <th>{t('person')}</th>
              <th className="num">{t('attempts')}</th>
              <th className="num">{t('latest')}</th>
              <th className="num">{t('best')}</th>
              <th>{t('lastTaken')}</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.alias}>
                <td>
                  <button className="qz-rowlink" onClick={() => setOpen({ ...person, attempt: person.history[0]!.id })}>
                    {person.name}
                  </button>
                </td>
                <td className="num">{person.attempts}</td>
                <td className="num">{asPercent(person.latest)}</td>
                <td className="num">{asPercent(person.best)}</td>
                <td>{formatDate(person.last_taken)}</td>
              </tr>
            ))}
            {people.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Text tone="muted">{data.people.length === 0 ? t('resultsEmpty') : t('nobodyMatches')}</Text>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="qz-muted qz-small" style={{ marginTop: 8 }}>
        {t('practiceNeverHere')}
      </p>
      {open && (
        <Modal title={open.name} size="lg" onClose={() => setOpen(null)}>
          {open.history.length > 1 && (
            <Select aria-label={t('attempt')} value={open.attempt} onChange={(event: { target: HTMLSelectElement }) => setOpen({ ...open, attempt: event.target.value })}>
              {open.history.map((attempt) => (
                <option key={attempt.id} value={attempt.id}>
                  {t('attemptOn', { date: formatDate(attempt.completed_at), percent: asPercent(attempt.percent) })}
                </option>
              ))}
            </Select>
          )}
          <PersonAttempt quiz={view.quiz.id} attempt={open.attempt} />
        </Modal>
      )}
    </>
  );
}

// Guests' attempts from the quiz's public links (Academy REQ72, REQ73): apart from the project's people, newest first, live as
// they arrive. A guest's name is their own words, drawn as text.
interface GuestsView {
  attempts: Array<{ id: string; name: string | null; link: string; completed_at: string; score: number; total: number; waiting: number }>;
}

const shortLink = (t: PluginHost['t'], link: string): string => t('shortLink', { link: `${link.slice(0, 4)}…${link.slice(-4)}` });

function GuestsTab({ view }: { view: QuizView }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const act = useAct();
  const { data, error, reload } = useData<GuestsView>(`guests?id=${Q(view.quiz.id)}`);
  const [link, setLink] = useState('');
  const [open, setOpen] = useState<GuestsView['attempts'][number] | null>(null);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Loading />;
  const links = [...new Set(data.attempts.map((attempt) => attempt.link))];
  const rows = data.attempts.filter((attempt) => link === '' || attempt.link === link);
  const nameOf = (attempt: GuestsView['attempts'][number]): string => attempt.name ?? t('noNameGiven');
  const remove = async (attempt: GuestsView['attempts'][number]): Promise<void> => {
    const ask = attempt.name === null ? t('removeGuestAttemptAsk') : t('removeNamedAttemptAsk', { name: attempt.name });
    if (!(await host.dialog.confirm(ask, { title: t('removeGuestAttempt'), ok: t('remove'), danger: true }))) return;
    await act(t('removeAttemptFailed'), async () => {
      await host.del(`guests?id=${Q(view.quiz.id)}&attempt=${Q(attempt.id)}`);
      setOpen(null);
      reload();
    });
  };
  const removeLink = async (): Promise<void> => {
    const count = rows.length;
    if (
      !(await host.dialog.confirm(t(count === 1 ? 'removeLinkAttemptsAskOne' : 'removeLinkAttemptsAsk', { n: count, link: shortLink(t, link) }), {
        title: t('removeLinkAttempts'),
        ok: t('removeAll'),
        danger: true,
      }))
    )
      return;
    await act(t('removeAttemptsFailed'), async () => {
      await host.del(`guests?id=${Q(view.quiz.id)}&link=${Q(link)}`);
      setLink('');
      reload();
    });
  };
  const scoreOf = (attempt: GuestsView['attempts'][number]): string =>
    attempt.waiting > 0
      ? t('guestScoreWaiting', { score: attempt.score, total: attempt.total, n: attempt.waiting })
      : t('guestScore', { score: attempt.score, total: attempt.total, percent: asPercent(attempt.total === 0 ? 0 : attempt.score / attempt.total) });
  return (
    <>
      <Row justify="between" wrap gap="sm">
        <Text tone="muted">{t('guestsHint')}</Text>
        {links.length > 1 && (
          <Select filter aria-label={t('link')} value={link} onChange={(event: { target: HTMLSelectElement }) => setLink(event.target.value)}>
            <option value="">{t('allLinks')}</option>
            {links.map((each) => (
              <option key={each} value={each}>
                {shortLink(t, each)}
              </option>
            ))}
          </Select>
        )}
      </Row>
      <div className="qz-scroll" style={{ marginTop: 10 }}>
        <table className="qz-table">
          <thead>
            <tr>
              <th>{t('guest')}</th>
              <th>{t('score')}</th>
              <th>{t('link')}</th>
              <th>{t('arrived')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((attempt) => (
              <tr key={attempt.id}>
                <td>
                  <button className="qz-rowlink" onClick={() => setOpen(attempt)}>
                    {attempt.name ?? <span className="qz-muted">{t('noNameGiven')}</span>}
                  </button>
                </td>
                <td>{scoreOf(attempt)}</td>
                <td className="qz-muted">{shortLink(t, attempt.link)}</td>
                <td>{formatDate(attempt.completed_at)}</td>
                <td className="num">
                  <Button size="sm" variant="quiet" onClick={() => void remove(attempt)}>
                    {t('remove')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {link !== '' && (
        <Row justify="end" style={{ marginTop: 10 }}>
          <Button size="sm" variant="danger-fill" onClick={() => void removeLink()}>
            {t('removeAllFromLink')}
          </Button>
        </Row>
      )}
      {open && (
        <Modal title={nameOf(open)} size="lg" onClose={() => setOpen(null)}>
          <PersonAttempt quiz={view.quiz.id} attempt={open.id} />
        </Modal>
      )}
    </>
  );
}

function PersonAttempt({ quiz, attempt }: { quiz: string; attempt: string }): JSX.Element {
  const { t } = usePluginHost();
  const { data, error } = useData<Attempt>(`attempt?id=${Q(quiz)}&attempt=${Q(attempt)}`);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Text tone="muted">{t('loading')}</Text>;
  return (
    <div className="qz" style={{ padding: '10px 0 0' }}>
      <div className="qz-stats">
        <Stat
          hero
          label={t('score')}
          value={(data.waiting ?? 0) > 0 ? `${data.score}` : asPercent(data.score / data.total)}
          sub={(data.waiting ?? 0) > 0 ? t('pointsSoFar', { n: data.waiting ?? 0 }) : t(data.total === 1 ? 'pointsOfOne' : 'pointsOf', { earned: data.score, n: data.total })}
        />
        <Stat
          label={t('missed')}
          value={data.answers.filter((answer) => answer.earned !== null && answer.earned < answer.question.points).length}
          sub={t(data.answers.length === 1 ? 'missedOfOne' : 'missedOf', { n: data.answers.length, date: formatDate(data.completed_at) })}
        />
      </div>
      <Review attempt={data} chose={t('chose')} />
    </div>
  );
}

// ---- the parts of a question the builder edits ---------------------------------------------------------------

type Referenced = QuizView['references'][number];

// A question changed to another type keeps what every type shares and starts its answer over.
function retyped(question: Question, type: QuestionType): Question {
  const fresh = blankQuestion(question.id, type);
  return { ...fresh, prompt: question.prompt, context: question.context, image: question.image, points: question.points, why: question.why, reference: question.reference };
}

// An optional part of a question, behind a button of its own until it is wanted.
function Extra({ label, shown, onOpen, hint, children }: { label: string; shown: boolean; onOpen: () => void; hint: string; children: ReactNode }): JSX.Element {
  const { t } = usePluginHost();
  if (!shown)
    return (
      <div>
        <button type="button" className="qz-add" onClick={onOpen}>
          {t('addOptional', { label: label.toLowerCase() })}
        </button>
      </div>
    );
  return (
    <div>
      <span className="qz-label">{t('labelOptional', { label })}</span>
      {children}
      <Text tone="faint" size="sm" block>
        {hint}
      </Text>
    </div>
  );
}

// A list of lines a person adds to and takes from: options, accepted answers, items.
function Lines({
  label,
  values,
  min,
  max,
  noun,
  onChange,
  mark,
  ordered = false,
}: {
  label: string;
  values: string[];
  min: number;
  max: number;
  noun: string;
  onChange: (values: string[], removed?: number, moved?: [number, number]) => void;
  mark?: (index: number) => ReactNode;
  ordered?: boolean;
}): JSX.Element {
  const { t } = usePluginHost();
  const move = (from: number, to: number): void => {
    const next = [...values];
    const [taken] = next.splice(from, 1);
    next.splice(to, 0, taken!);
    onChange(next, undefined, [from, to]);
  };
  return (
    <div>
      <span className="qz-label">{label}</span>
      {values.map((value, index) => (
        <div className="qz-key" key={index}>
          {mark ? mark(index) : ordered ? <span className="qz-muted qz-small">{index + 1}</span> : null}
          <Input aria-label={t('lineN', { noun, n: index + 1 })} value={value} onChange={(event: { target: HTMLInputElement }) => onChange(values.map((held, at) => (at === index ? event.target.value : held)))} />
          {ordered && (
            <>
              <Button size="sm" variant="quiet" aria-label={t('lineMoveUp', { noun: noun.toLowerCase(), n: index + 1 })} disabled={index === 0} onClick={() => move(index, index - 1)}>
                ▲
              </Button>
              <Button
                size="sm"
                variant="quiet"
                aria-label={t('lineMoveDown', { noun: noun.toLowerCase(), n: index + 1 })}
                disabled={index === values.length - 1}
                onClick={() => move(index, index + 1)}
              >
                ▼
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="quiet"
            aria-label={t('lineRemove', { noun: noun.toLowerCase(), n: index + 1 })}
            disabled={values.length <= min}
            onClick={() =>
              onChange(
                values.filter((_, at) => at !== index),
                index,
              )
            }
          >
            ×
          </Button>
        </div>
      ))}
      <Button size="sm" disabled={values.length >= max} onClick={() => onChange([...values, ''])}>
        {t('lineAdd', { noun: noun.toLowerCase() })}
      </Button>
    </div>
  );
}

// What a question's type asks for as its answer (Academy REQ59).
function AnswerFields({ question, change }: { question: Question; change: (patch: Partial<Question>) => void }): JSX.Element {
  const { t } = usePluginHost();
  const shiftAfter = (indexes: number[], removed?: number, moved?: [number, number]): number[] => {
    if (moved) {
      const order = question.options.map((_, index) => index);
      const [taken] = order.splice(moved[0], 1);
      order.splice(moved[1], 0, taken!);
      return indexes.map((index) => order.indexOf(index));
    }
    if (removed === undefined) return indexes;
    return indexes.filter((index) => index !== removed).map((index) => (index > removed ? index - 1 : index));
  };
  switch (question.type) {
    case 'choice':
    case 'truefalse': {
      const single = (index: number): ReactNode => (
        <input
          type="radio"
          name="qz-answer"
          aria-label={t('isTheAnswer', {
            option: (question.type === 'truefalse' ? trueFalseWord(t, question.options[index] ?? '') : question.options[index]) || t('optionN', { n: index + 1 }),
          })}
          checked={question.answer === index}
          onChange={() => change({ answer: index, correct: [index] })}
        />
      );
      if (question.type === 'truefalse')
        return (
          <div role="radiogroup" aria-label={t('theAnswer')}>
            <span className="qz-label">{t('whichIsTheAnswer')}</span>
            {question.options.map((option, index) => (
              <label className="qz-key" key={option}>
                {single(index)}
                <span>{trueFalseWord(t, option)}</span>
              </label>
            ))}
          </div>
        );
      return (
        <div role="radiogroup" aria-label={t('theAnswer')}>
          <Lines
            label={t('optionsPickOne')}
            noun={t('option')}
            values={question.options}
            min={2}
            max={5}
            mark={single}
            onChange={(options, removed) => {
              const correct = shiftAfter(question.correct, removed);
              change({ options, correct, answer: correct[0] ?? null });
            }}
          />
        </div>
      );
    }
    case 'all':
      return (
        <Lines
          label={t('optionsCheckTrue')}
          noun={t('option')}
          values={question.options}
          min={2}
          max={8}
          mark={(index) => (
            <input
              type="checkbox"
              aria-label={t('isTrue', { option: question.options[index] || t('optionN', { n: index + 1 }) })}
              checked={question.correct.includes(index)}
              onChange={(event: { target: HTMLInputElement }) => {
                const correct = event.target.checked ? [...question.correct, index].sort((a, b) => a - b) : question.correct.filter((held) => held !== index);
                change({ correct, answer: correct[0] ?? null });
              }}
            />
          )}
          onChange={(options, removed) => {
            const correct = shiftAfter(question.correct, removed);
            change({ options, correct, answer: correct[0] ?? null });
          }}
        />
      );
    case 'short':
      return <Lines label={t('acceptedAnswers')} noun={t('answer')} values={question.accepted} min={1} max={12} onChange={(accepted) => change({ accepted })} />;
    case 'order':
      return <Lines label={t('itemsInOrder')} noun={t('item')} values={question.items} min={2} max={8} ordered onChange={(items) => change({ items })} />;
    case 'match':
      return (
        <div>
          <span className="qz-label">{t('pairsHint')}</span>
          {question.pairs.map((pair, index) => (
            <div className="qz-key" key={index}>
              <Input
                aria-label={t('pairLeft', { n: index + 1 })}
                value={pair.left}
                onChange={(event: { target: HTMLInputElement }) => change({ pairs: question.pairs.map((held, at) => (at === index ? { ...held, left: event.target.value } : held)) })}
              />
              <Input
                aria-label={t('pairRight', { n: index + 1 })}
                value={pair.right}
                onChange={(event: { target: HTMLInputElement }) => change({ pairs: question.pairs.map((held, at) => (at === index ? { ...held, right: event.target.value } : held)) })}
              />
              <Button
                size="sm"
                variant="quiet"
                aria-label={t('removePair', { n: index + 1 })}
                disabled={question.pairs.length <= 2}
                onClick={() => change({ pairs: question.pairs.filter((_, at) => at !== index) })}
              >
                ×
              </Button>
            </div>
          ))}
          <Button size="sm" disabled={question.pairs.length >= 8} onClick={() => change({ pairs: [...question.pairs, { left: '', right: '' }] })}>
            {t('addPair')}
          </Button>
        </div>
      );
    case 'written':
      return (
        <>
          <label>
            <span className="qz-label">{t('modelAnswerHint')}</span>
            <Textarea rows={3} value={question.model} onChange={(event: { target: HTMLTextAreaElement }) => change({ model: event.target.value })} />
          </label>
          <label>
            <span className="qz-label">{t('coversHint')}</span>
            <Textarea rows={3} value={question.covers} onChange={(event: { target: HTMLTextAreaElement }) => change({ covers: event.target.value })} />
          </label>
        </>
      );
  }
}

// What a reference reads as: the blueprint's title and its section, an asset, a link, or text.
function referenceLabel(t: PluginHost['t'], reference: string, references: Referenced[]): string {
  const link = referenceLink(reference);
  if (!link) return '';
  if (link.kind === 'blueprint') {
    const found = references.find((held) => held.id === link.id);
    const name = found ? `${link.id} ${found.title}` : link.id;
    return link.section ? `${name} › ${link.section}` : name;
  }
  if (link.kind === 'asset') return t('assetPath', { path: link.path });
  if (link.kind === 'link') return link.url;
  return link.text;
}

// The reference, as a link once someone has answered (Academy REQ61).
function ReferenceLine({ reference, references }: { reference: string; references: Referenced[] }): JSX.Element | null {
  const host = usePluginHost();
  const link = referenceLink(reference);
  if (!link) return null;
  const label = referenceLabel(host.t, reference, references);
  if (link.kind === 'blueprint') {
    const found = references.find((held) => held.id === link.id);
    if (found)
      return (
        <div className="qz-small">
          <a className="qz-link" href={host.hrefs.blueprint(found.rel)}>
            {label}
          </a>
        </div>
      );
  }
  if (link.kind === 'link')
    return (
      <div className="qz-small">
        <a className="qz-link" href={link.url} target="_blank" rel="noreferrer">
          {label}
        </a>
      </div>
    );
  return <div className="qz-muted qz-small">{label}</div>;
}

// A reference links to one thing: a section of what the quiz draws from first, any blueprint,
// an asset, or a web link (Academy REQ61).
function ReferencePicker({ value, references, drawsFrom, onChange }: { value: string; references: Referenced[]; drawsFrom: string[]; onChange: (reference: string) => void }): JSX.Element {
  const { t } = usePluginHost();
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [web, setWeb] = useState(false);
  const { data: pickable } = useData<Pickable>(picking ? 'pickable' : null);
  const choices = useMemo(() => {
    const ours = references.filter((held) => drawsFrom.includes(held.id));
    const out: Array<{ value: string; label: string }> = [];
    for (const held of ours) {
      out.push({ value: held.id, label: `${held.id} ${held.title}` });
      for (const section of held.sections) out.push({ value: `${held.id}#${section}`, label: `${held.id} ${held.title} › ${section}` });
    }
    for (const source of drawsFrom) if (source.startsWith('assets/')) out.push({ value: source, label: t('assetPath', { path: source }) });
    for (const blueprint of pickable?.blueprints ?? []) if (!out.some((held) => held.value === blueprint.id)) out.push({ value: blueprint.id, label: `${blueprint.id} ${blueprint.title}` });
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return out.filter((choice) => words.every((word) => choice.label.toLowerCase().includes(word))).slice(0, 12);
  }, [references, drawsFrom, pickable, search, t]);
  const done = (reference: string): void => {
    onChange(reference);
    setPicking(false);
    setWeb(false);
    setSearch('');
  };
  if (picking)
    return (
      <div className="qz-picker">
        <span className="qz-label">{t('referenceOptional')}</span>
        {web ? (
          <Input aria-label={t('webLink')} placeholder="https://" value={search} onChange={(event: { target: HTMLInputElement }) => setSearch(event.target.value)} />
        ) : (
          <Input
            aria-label={t('searchReference')}
            placeholder={t('searchReferencePlaceholder')}
            value={search}
            onChange={(event: { target: HTMLInputElement }) => setSearch(event.target.value)}
          />
        )}
        {!web && (
          <div style={{ marginTop: 8 }}>
            {choices.length === 0 && (
              <Text tone="faint" size="sm" block>
                {t('nothingMatches')}
              </Text>
            )}
            {choices.map((choice) => (
              <button type="button" key={choice.value} className="qz-qrow" onClick={() => done(choice.value)}>
                <span className="qz-one">{choice.label}</span>
              </button>
            ))}
          </div>
        )}
        <Row gap="sm" wrap>
          {web ? (
            <Button size="sm" variant="primary" disabled={!/^https?:\/\/\S+$/i.test(search.trim())} onClick={() => done(search.trim())}>
              {t('linkIt')}
            </Button>
          ) : (
            <button
              type="button"
              className="qz-add"
              onClick={() => {
                setWeb(true);
                setSearch('');
              }}
            >
              {t('pasteWebLink')}
            </button>
          )}
          <Button size="sm" variant="quiet" onClick={() => setPicking(false)}>
            {t('cancel')}
          </Button>
        </Row>
      </div>
    );
  if (!value.trim())
    return (
      <div>
        <button type="button" className="qz-add" onClick={() => setPicking(true)}>
          {t('linkReferenceOptional')}
        </button>
      </div>
    );
  return (
    <div>
      <span className="qz-label">{t('referenceOptional')}</span>
      <Row gap="xs" wrap>
        <span className="qz-pill">{referenceLabel(t, value, references)}</span>
        <Button size="sm" variant="quiet" onClick={() => setPicking(true)}>
          {t('change')}
        </Button>
        <Button size="sm" variant="quiet" onClick={() => onChange('')}>
          {t('remove')}
        </Button>
      </Row>
      <Text tone="faint" size="sm" block>
        {t('referenceHint')}
      </Text>
    </div>
  );
}

// ---- the builder -------------------------------------------------------------------------------------------

function Builder({ view, generate, reload }: { view: QuizView; generate: string | null; reload: () => void }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const act = useAct();
  const { quiz } = view;
  const alias = host.user?.alias ?? null;
  const [picked, setPicked] = useState<string | null>(quiz.questions[0]?.id ?? null);
  const [draft, setDraft] = useState<Question | null>(null);
  const [count, setCount] = useState(generate ?? '20');
  // a new question asks for its type first, with none chosen (Academy REQ7)
  const [typeless, setTypeless] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const held = quiz.questions.find((question) => question.id === picked) ?? null;
  const pick = (id: string | null): void => {
    setPicked(id);
    setDraft(null);
    setTypeless(false);
    setContextOpen(false);
    setImageOpen(false);
  };
  const editing = draft ?? held;

  const dirty = draft !== null;
  const change = (patch: Partial<Question>): void => setDraft({ ...(editing as Question), ...patch });
  const number = editing ? (draft && !held ? [...quiz.questions, draft] : quiz.questions).findIndex((question) => question.id === editing.id) + 1 : 0;
  // the question being written, which leaving the page, another question, or a new one asks about first (Unsaved Changes)
  const writing = useDraft(
    {
      dirty,
      title: t('questionN', { n: number }),
      save: async () => {
        if (!draft) return true;
        if (typeless) throw new Error(t('chooseTypeFirst'));
        await host.put(`question?id=${Q(quiz.id)}`, { question: draft });
        setPicked(draft.id);
        setDraft(null);
        reload();
        return true;
      },
      discard: () => {
        if (held) setDraft(null);
        else {
          setDraft(null);
          setTypeless(false);
          setPicked(quiz.questions[0]?.id ?? null);
        }
      },
    },
    t('saveQuestionFailed'),
  );
  const setting = (patch: Partial<Pick<Quiz, 'shuffle_questions' | 'shuffle_options' | 'guest_name'>>): void => {
    void act(t('changeQuizFailed'), async () => {
      await host.put(`quiz?id=${Q(quiz.id)}`, patch);
      reload();
    });
  };
  const add = (): void =>
    writing.leave(
      () =>
        void act(t('addQuestionFailed'), async () => {
          const blank = await host.post<Question>(`question/blank?id=${Q(quiz.id)}`);
          pick(blank.id);
          setDraft(blank);
          setTypeless(true);
        }),
    );
  const remove = async (): Promise<void> => {
    if (!held) {
      setDraft(null);
      setPicked(quiz.questions[0]?.id ?? null);
      return;
    }
    if (!(await host.dialog.confirm(t('deleteQuestionAsk'), { title: t('deleteQuestion'), ok: t('delete'), danger: true }))) return;
    await act(t('deleteQuestionFailed'), async () => {
      await host.del(`question?id=${Q(quiz.id)}&question=${Q(held.id)}`);
      setPicked(quiz.questions.find((question) => question.id !== held.id)?.id ?? null);
      setDraft(null);
      reload();
    });
  };
  const nudge = (id: string, by: number): void => {
    const ids = quiz.questions.map((question) => question.id);
    const at = ids.indexOf(id);
    const [taken] = ids.splice(at, 1);
    ids.splice(at + by, 0, taken!);
    void act(t('reorderQuestionsFailed'), async () => {
      await host.put(`questions/order?id=${Q(quiz.id)}`, { ids });
      reload();
    });
  };
  const rows = draft && !held ? [...quiz.questions, draft] : quiz.questions;
  const totalPoints = quiz.questions.reduce((total, question) => total + question.points, 0);
  return (
    <>
      {generate && quiz.questions.length === 0 && (
        <div style={{ marginBottom: 14 }}>
          <Notice>{t('generateQuestionsNotice')}</Notice>
        </div>
      )}
      <div className="qz-edit">
        {/* the questions and how to add more on one side, with the quiz's own settings under them; the question open on the other */}
        <aside className="qz-edit-side">
          <div className="qz-panel">
            <div className="qz-panel-head">
              <span className="qz-panel-title">{t('questions')}</span>
              <span className="qz-faint qz-small">
                {quiz.questions.length} · {t(totalPoints === 1 ? 'pointCountOne' : 'pointCount', { n: totalPoints })}
              </span>
            </div>
            <div className="qz-plist">
              {rows.map((question, index) => (
                <button key={question.id} className="qz-qrow" aria-current={question.id === picked ? 'true' : undefined} onClick={() => question.id !== picked && writing.leave(() => pick(question.id))}>
                  <span className="qz-qnum">{index + 1}</span>
                  <span className="qz-qtext">
                    <span className="qz-one" title={question.prompt}>
                      {question.prompt || t('newQuestion')}
                    </span>
                    <span className="qz-faint qz-small">
                      {typeless && draft?.id === question.id ? t('noTypeYet') : t(TYPE_NAME_KEYS[question.type])} · {t(question.points === 1 ? 'pointCountOne' : 'pointCount', { n: question.points })}
                    </span>
                  </span>
                </button>
              ))}
              {rows.length === 0 && (
                <div style={{ padding: 12 }}>
                  <Text tone="muted" size="sm">
                    {t('noQuestionsYet')}
                  </Text>
                </div>
              )}
            </div>
            <div className="qz-panel-foot">
              <button type="button" className="qz-addq" onClick={add} disabled={draft !== null && !held}>
                {t('addQuestion')}
              </button>
              <div className="qz-gen">
                <span className="qz-gen-count">
                  <Input aria-label={t('howManyToGenerate')} type="number" min={1} value={count} onChange={(event: { target: HTMLInputElement }) => setCount(event.target.value)} />
                </span>
                <Generate
                  label={t('generateQuestions')}
                  title={t('questionsChatTitle', { title: quiz.title })}
                  text={generateText(quiz, Number(count) || 20, alias)}
                  existing={quiz.questions.length}
                  noun="question"
                  what="quiz"
                />
              </div>
            </div>
          </div>
          <div className="qz-panel">
            <div className="qz-panel-head">
              <span className="qz-panel-title">{t('quizSettings')}</span>
            </div>
            <div className="qz-settings">
              <label className="qz-check">
                <input type="checkbox" checked={quiz.shuffle_questions} onChange={(event: { target: HTMLInputElement }) => setting({ shuffle_questions: event.target.checked })} />
                <span>
                  {t('shuffleQuestions')}
                  <span className="qz-faint qz-block">{t('shuffleQuestionsHint')}</span>
                </span>
              </label>
              <label className="qz-check">
                <input type="checkbox" checked={quiz.shuffle_options} onChange={(event: { target: HTMLInputElement }) => setting({ shuffle_options: event.target.checked })} />
                <span>
                  {t('shuffleOptions')}
                  <span className="qz-faint qz-block">{t('shuffleOptionsHint')}</span>
                </span>
              </label>
              {/* how a guest from a public link gives their name (Academy REQ70) */}
              <div>
                <span className="qz-label">{t('guestsGiveName')}</span>
                <Seg aria-label={t('guestsGiveName')}>
                  {GUEST_NAME_CHOICES.map(([value, label]) => (
                    <SegItem key={value} active={quiz.guest_name === value} selected={quiz.guest_name === value} onClick={() => setting({ guest_name: value })}>
                      {t(label)}
                    </SegItem>
                  ))}
                </Seg>
              </div>
            </div>
          </div>
        </aside>
        <section className="qz-edit-main">
          {!editing ? (
            <div className="qz-panel qz-edit-empty">
              <Text tone="muted">{rows.length === 0 ? t('builderEmpty') : t('pickQuestion')}</Text>
            </div>
          ) : (
            <div className="qz-panel">
              <div className="qz-panel-head qz-edit-head">
                <span className="qz-edit-num">{t('questionN', { n: number })}</span>
                <span className="qz-edit-type">
                  <Select
                    aria-label={t('questionType')}
                    required
                    value={typeless ? '' : editing.type}
                    onChange={(event: { target: HTMLSelectElement }) => {
                      const type = event.target.value as QuestionType;
                      if (!type) return;
                      setTypeless(false);
                      setDraft(retyped(editing, type));
                    }}
                  >
                    <option value="" disabled>
                      {t('chooseType')}
                    </option>
                    {QUESTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(TYPE_NAME_KEYS[type])}
                      </option>
                    ))}
                  </Select>
                </span>
                <span className="qz-edit-tools">
                  {held && <Ask label={t('regenerate')} title={t('regenerateChatTitle', { text: held.prompt.slice(0, 40) })} text={regenerateText(quiz, held)} />}
                  {held && (
                    <>
                      <Button
                        size="sm"
                        variant="quiet"
                        disabled={quiz.questions[0]?.id === held.id}
                        aria-label={t('moveQuestionUp')}
                        data-tip={t('moveUpTip')}
                        onClick={() => nudge(held.id, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="quiet"
                        disabled={quiz.questions.at(-1)?.id === held.id}
                        aria-label={t('moveQuestionDown')}
                        data-tip={t('moveDownTip')}
                        onClick={() => nudge(held.id, 1)}
                      >
                        ↓
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="quiet" aria-label={t('deleteQuestion')} onClick={remove}>
                    {t('delete')}
                  </Button>
                </span>
              </div>
              {typeless ? (
                <div className="qz-edit-body">
                  <Notice>{t('chooseTypeNotice')}</Notice>
                </div>
              ) : (
                <div className="qz-edit-body">
                  <div className="qz-sec">
                    <label className="qz-sec-title" htmlFor="qz-prompt">
                      {t('question')}
                    </label>
                    <Textarea
                      id="qz-prompt"
                      rows={2}
                      placeholder={t('promptPlaceholder')}
                      value={editing.prompt}
                      onChange={(event: { target: HTMLTextAreaElement }) => change({ prompt: event.target.value })}
                    />
                    <div className="qz-extras">
                      <Extra label={t('context')} shown={contextOpen || editing.context.trim() !== ''} onOpen={() => setContextOpen(true)} hint={t('contextHint')}>
                        <Textarea
                          aria-label={t('context')}
                          rows={2}
                          placeholder={t('contextPlaceholder')}
                          value={editing.context}
                          onChange={(event: { target: HTMLTextAreaElement }) => change({ context: event.target.value })}
                        />
                      </Extra>
                      <Extra label={t('image')} shown={imageOpen || editing.image.trim() !== ''} onOpen={() => setImageOpen(true)} hint={t('imageHint')}>
                        <Input aria-label={t('image')} placeholder="assets/map.png" value={editing.image} onChange={(event: { target: HTMLInputElement }) => change({ image: event.target.value })} />
                      </Extra>
                    </div>
                  </div>
                  <div className="qz-sec">
                    <span className="qz-sec-title">{t('answer')}</span>
                    <AnswerFields question={editing} change={change} />
                  </div>
                  <div className="qz-sec">
                    <span className="qz-sec-title">{editing.type === 'written' ? t('source') : t('explanation')}</span>
                    {editing.type !== 'written' && (
                      <label>
                        <span className="qz-label">{t('whyAnswer')}</span>
                        <Textarea rows={3} value={editing.why} onChange={(event: { target: HTMLTextAreaElement }) => change({ why: event.target.value })} />
                      </label>
                    )}
                    <ReferencePicker value={editing.reference} references={view.references} drawsFrom={quiz.draws_from} onChange={(reference) => change({ reference })} />
                  </div>
                  <div className="qz-sec">
                    <span className="qz-sec-title">{t('scoring')}</span>
                    <div className="qz-two">
                      <label>
                        <span className="qz-label">{t('points')}</span>
                        <Input
                          aria-label={t('points')}
                          inputMode="numeric"
                          placeholder="1"
                          value={editing.points === 1 ? '' : String(editing.points)}
                          onChange={(event: { target: HTMLInputElement }) => {
                            const value = event.target.value.trim();
                            change({ points: value === '' ? 1 : Math.max(0, Math.floor(Number(value)) || 0) });
                          }}
                        />
                      </label>
                      <div>
                        <span className="qz-label">{t('graded')}</span>
                        <Text tone="muted" size="sm">
                          {editing.type === 'written' ? t('gradedLater') : t('gradedRightAway')}
                        </Text>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <DraftNotice draft={writing} />
              <div className="qz-edit-foot">
                <Text tone="faint" size="sm">
                  {dirty ? (KIT_DRAFTS ? '' : t('unsavedChanges')) : t('builderFootHint')}
                </Text>
                <DraftActions draft={writing} canSave={!typeless} />
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

// ---- grading written answers (Academy REQ65 to REQ67) -----------------------------------------------------

interface WaitingAnswer_ {
  attempt: string;
  person: string;
  name: string;
  // a guest's, from a public link (Academy REQ74)
  guest?: boolean;
  question: Question;
  response: string;
  completed_at: string;
  earned: number | null;
  grade: GradeMark | null;
  suggestion: GradeMark | null;
}
interface ToGradeView {
  waiting: WaitingAnswer_[];
  graded: WaitingAnswer_[];
}

// What the grader's own agent is asked: every answer waiting, or the one open.
function gradeText(quiz: Quiz, alias: string | null, accept: boolean, one: WaitingAnswer_ | null): string {
  const record = `eidos academy grade add ${quiz.id} <attempt> <question> --points <n> --note "<note>" --ai${accept ? '' : ' --suggestion'}${alias ? ` --for ${alias}` : ''}`;
  return [
    one
      ? `Suggest a grade for ${one.name}'s written answer to question ${one.question.id} of the quiz "${quiz.title}" (${quiz.id}), attempt ${one.attempt}.`
      : `Grade the written answers waiting in the quiz "${quiz.title}" (${quiz.id}).`,
    `Read them with \`eidos academy grade list ${quiz.id} --json\`${one ? `, and take only that one` : ''}.`,
    "Grade each one against its question's model answer and what a full answer covers, out of the question's points, on what the person wrote alone. Write a short, kind note to the person saying what they got and what a full answer has that theirs does not.",
    `Record each grade with \`${record}\`.`,
    accept && !one ? 'These grades count as soon as you record them.' : 'These are suggestions: the grader accepts or changes each one before it counts.',
  ].join('\n\n');
}

function gradeWords(t: PluginHost['t'], answer: WaitingAnswer_): { label: string; cls: string } {
  if (answer.grade) return { label: answer.grade.ai ? t('gradedByAiBadge') : t('graded'), cls: 'qz-badge good' };
  if (answer.suggestion) return { label: t('aiSuggestsReview'), cls: 'qz-badge accent' };
  return { label: t('waiting'), cls: 'qz-badge' };
}

function AiGradeDialog({ quiz, count, onClose }: { quiz: Quiz; count: number; onClose: () => void }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const [accept, setAccept] = useState(true);
  return (
    <Modal
      title={t(count === 1 ? 'gradeWithAiTitleOne' : 'gradeWithAiTitle', { n: count })}
      onClose={onClose}
      foot={
        <Row justify="end" gap="sm">
          <Button onClick={onClose}>{t('cancel')}</Button>
          <AskAndClose label={t('grade')} title={t('gradeChatTitle', { title: quiz.title })} text={gradeText(quiz, host.user?.alias ?? null, accept, null)} onClose={onClose} />
        </Row>
      }
    >
      <Stack gap="md" pad="md">
        <Text>{t('aiGradeHint')}</Text>
        <label className="qz-check">
          <input type="checkbox" checked={accept} onChange={(event: { target: HTMLInputElement }) => setAccept(event.target.checked)} />
          <span>
            <strong>{t('giveGradesRightAway')}</strong>
            <span className="qz-muted qz-small qz-block">{t('giveGradesRightAwayHint')}</span>
          </span>
        </label>
        <Text tone="faint" size="sm">
          {t('changeGradeLater')}
        </Text>
      </Stack>
    </Modal>
  );
}

// One written answer graded in the page itself, not over it, so the person's agent in Chat stays in reach while they grade
// (to read or copy what it says), and a grade it suggests appears here as soon as it is recorded. `answer` is drawn from the
// To grade data as it now stands, and the panel is keyed by the answer, so a redraw after a file change keeps what the
// grader has typed while the next answer opens with its own grade.
function GradePanel({
  quiz,
  answer,
  at,
  count,
  references,
  onSkip,
  onClose,
  onSaved,
}: {
  quiz: Quiz;
  answer: WaitingAnswer_;
  at: number;
  count: number;
  references: Referenced[];
  onSkip: () => void;
  onClose: () => void;
  onSaved: () => void;
}): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const act = useAct();
  const held = answer.grade ?? null;
  const [points, setPoints] = useState<number | null>(held?.points ?? null);
  const [note, setNote] = useState(held?.note ?? '');
  const { question, suggestion } = answer;
  const save = async (): Promise<void> => {
    if (points === null) return;
    const ok = await act(t('saveGradeFailed'), () => host.post('grade', { quiz: quiz.id, attempt: answer.attempt, question: question.id, points, note }));
    if (ok) onSaved();
  };
  return (
    <section className="qz-grade" aria-label={t('gradingAnswer', { name: answer.name })}>
      <div className="qz-grade-head">
        <button type="button" className="qz-link qz-small qz-quiet-link" onClick={onClose}>
          {t('allAnswers')}
        </button>
        <span className="qz-muted qz-small">{t('xOfY', { n: at + 1, of: count })}</span>
      </div>
      <div className="qz-card qz-grade-card">
        <div className="qz-grade-who">
          <strong>{answer.name}</strong>
          {answer.guest && <span className="qz-badge accent">{t('guest')}</span>}
          <span className="qz-faint qz-small">{formatDate(answer.completed_at)}</span>
        </div>
        <Text weight="strong">{question.prompt}</Text>
        {question.context.trim() && (
          <Text tone="muted" size="sm">
            {question.context}
          </Text>
        )}
        <div>
          <span className="qz-label">{t('theirAnswer')}</span>
          <div className="qz-answer">{answer.response}</div>
        </div>
        <div className="qz-two">
          <div className="qz-lines">
            <span className="qz-label">{t('modelAnswer')}</span>
            <Text size="sm">{question.model}</Text>
          </div>
          <div className="qz-lines">
            <span className="qz-label">{t('fullAnswerCovers')}</span>
            <Text size="sm">{question.covers || '-'}</Text>
          </div>
        </div>
        <ReferenceLine reference={question.reference} references={references} />
        <div>
          <Row justify="between" wrap gap="sm">
            <span className="qz-label" style={{ margin: 0 }}>
              {t('pointsOutOf', { n: question.points })}
            </span>
            {!suggestion && <Ask label={t('suggestGrade')} title={t('suggestGradeChatTitle', { name: answer.name })} text={gradeText(quiz, host.user?.alias ?? null, false, answer)} />}
          </Row>
          <div className="qz-pts" role="group" aria-label={t('points')}>
            {Array.from({ length: question.points + 1 }, (_, value) => (
              <button key={value} type="button" className={points === value ? 'on' : ''} aria-pressed={points === value} onClick={() => setPoints(value)}>
                {value}
              </button>
            ))}
          </div>
          {suggestion && (
            <div className="qz-suggest">
              <strong>{t(suggestion.ai ? 'agentSuggests' : 'suggested', { points: suggestion.points, of: question.points })}</strong> {suggestion.note}
              <div className="qz-muted qz-small">{t('suggestionOnly')}</div>
              <div style={{ marginTop: 8 }}>
                <Button
                  size="sm"
                  onClick={() => {
                    setPoints(suggestion.points);
                    setNote(suggestion.note);
                  }}
                >
                  {t('useSuggestion', { n: suggestion.points })}
                </Button>
              </div>
            </div>
          )}
        </div>
        <label>
          <span className="qz-label">{t('noteTo', { name: answer.name })}</span>
          <Textarea rows={2} value={note} onChange={(event: { target: HTMLTextAreaElement }) => setNote(event.target.value)} />
        </label>
        <div className="qz-grade-foot">
          <Button onClick={onSkip}>{at + 1 < count ? t('skip') : t('skipAndFinish')}</Button>
          <Button variant="primary" disabled={points === null} onClick={save}>
            {at + 1 < count ? t('saveGradeNext') : t('saveGradeFinish')}
          </Button>
        </div>
      </div>
    </section>
  );
}

function GradingTab({ view, reloadQuiz }: { view: QuizView; reloadQuiz: () => void }): JSX.Element {
  const { t } = usePluginHost();
  const { data, error, reload } = useData<ToGradeView>(`to-grade?id=${Q(view.quiz.id)}`);
  const [show, setShow] = useState<'waiting' | 'graded'>('waiting');
  // the answers being walked through, by attempt and question, in the order the walk began: grading one moves it from
  // Waiting to Graded, and the walk goes on to the next rather than shifting under the grader
  const [grading, setGrading] = useState<{ keys: string[]; at: number } | null>(null);
  const [ai, setAi] = useState(false);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <SkeletonBar />;
  const rows = show === 'waiting' ? data.waiting : data.graded;
  const keyOf = (answer: WaitingAnswer_): string => `${answer.attempt}/${answer.question.id}`;
  const walk = (list: WaitingAnswer_[], at: number): void => setGrading({ keys: list.map(keyOf), at });
  if (grading) {
    const wanted = grading.keys[grading.at];
    const answer = [...data.waiting, ...data.graded].find((each) => keyOf(each) === wanted) ?? null;
    const next = (): void => (grading.at + 1 < grading.keys.length ? setGrading({ ...grading, at: grading.at + 1 }) : setGrading(null));
    if (!answer) {
      // removed since the walk began (a guest's attempt taken away): go on to the next
      queueMicrotask(next);
      return <SkeletonBar />;
    }
    return (
      <GradePanel
        key={wanted}
        quiz={view.quiz}
        answer={answer}
        at={grading.at}
        count={grading.keys.length}
        references={view.references}
        onSkip={next}
        onClose={() => setGrading(null)}
        onSaved={() => {
          reload();
          reloadQuiz();
          next();
        }}
      />
    );
  }
  return (
    <>
      <Row justify="between" wrap gap="sm">
        <Seg>
          <SegItem active={show === 'waiting'} selected={show === 'waiting'} onClick={() => setShow('waiting')}>
            {t('waitingTab', { n: data.waiting.length })}
          </SegItem>
          <SegItem active={show === 'graded'} selected={show === 'graded'} onClick={() => setShow('graded')}>
            {t('gradedTab', { n: data.graded.length })}
          </SegItem>
        </Seg>
        <Row gap="sm" wrap>
          <Button size="sm" variant="accent" disabled={data.waiting.length === 0} onClick={() => setAi(true)}>
            {t('gradeWithAi')}
          </Button>
          <Button size="sm" variant="primary" disabled={data.waiting.length === 0} onClick={() => walk(data.waiting, 0)}>
            {t('startGrading')}
          </Button>
        </Row>
      </Row>
      <div className="qz-scroll" style={{ marginTop: 12 }}>
        {rows.length === 0 ? (
          <Empty>{show === 'waiting' ? t('nothingWaiting') : t('nothingGraded')}</Empty>
        ) : (
          <table className="qz-table">
            <thead>
              <tr>
                <th>{t('person')}</th>
                <th>{t('question')}</th>
                <th>{t('submitted')}</th>
                <th>{t('grade')}</th>
                <th className="num">{t('points')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((answer, index) => {
                const words = gradeWords(t, answer);
                return (
                  <tr key={`${answer.attempt}-${answer.question.id}`}>
                    <td>
                      <button type="button" className="qz-link" onClick={() => walk(rows, index)}>
                        {answer.name}
                      </button>
                      {answer.guest && (
                        <>
                          {' '}
                          <span className="qz-badge accent">{t('guest')}</span>
                        </>
                      )}
                    </td>
                    <td>
                      <span className="qz-one" title={answer.question.prompt}>
                        {answer.question.prompt}
                      </span>
                    </td>
                    <td>{formatDate(answer.completed_at)}</td>
                    <td>
                      <span className={words.cls}>{words.label}</span>
                    </td>
                    <td className="num">
                      {t('xOfY', { n: answer.grade ? answer.grade.points : answer.suggestion ? answer.suggestion.points : '…', of: answer.question.points })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <Text tone="faint" size="sm" block>
        {t('gradingFootHint')}
      </Text>
      {ai && <AiGradeDialog quiz={view.quiz} count={data.waiting.length} onClose={() => setAi(false)} />}
    </>
  );
}

// ---- the quiz page -------------------------------------------------------------------------------------------

function QuizPage({ id, tab, generate }: { id: string; tab: string; generate: string | null }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const act = useAct();
  const { data, error, reload } = useData<QuizView>(`quiz?id=${Q(id)}`);
  const { data: picks } = useData<Pickable>('pickable');
  const { data: overview } = useData<Overview>('overview');
  const [makingDeck, setMakingDeck] = useState(false);
  useTrail(
    data
      ? [
          { label: t('academy'), href: pageHref(host, '') },
          ...(data.course ? [{ label: data.course.title, href: pageHref(host, `course/${Q(data.course.id)}`) }] : []),
          { label: data.quiz.id, mono: true },
        ]
      : null,
  );
  if (error) return <Failed message={error} />;
  if (!data) return <Loading />;
  const { quiz, may } = data;
  const patch = (body: Record<string, unknown>): void => {
    void act(t('changeQuizFailed'), async () => {
      await host.put(`quiz?id=${Q(id)}`, body);
      reload();
    });
  };
  const remove = async (): Promise<void> => {
    const words = quiz.local ? t('deleteLocalAsk', { title: quiz.title }) : t('deleteAsk', { title: quiz.title, stays: t('deleteQuizStays') });
    if (!(await host.dialog.confirm(words, { title: t('deleteQuiz'), ok: t('delete'), danger: true }))) return;
    await act(t('deleteQuizFailed'), async () => {
      await host.del(`quiz?id=${Q(id)}`);
      host.navigate(pageHref(host, ''));
    });
  };
  const share = async (): Promise<void> => {
    const course = quiz.course ? (data.course?.title ?? null) : null;
    if (await shareWithProject(host, act, { kind: 'quiz', id: quiz.id, title: quiz.title, course })) reload();
  };
  const keep = async (): Promise<void> => {
    if (await keepJustForMe(host, act, { kind: 'quiz', id: quiz.id, title: quiz.title })) reload();
  };
  // a course and its quizzes are all the person's or all the project's (Academy REQ79)
  const sameSide = (overview?.courses ?? []).filter((held) => held.local === quiz.local);
  const tabs: Array<{ name: string; label: string; show: boolean }> = [
    { name: '', label: t('myScores'), show: true },
    { name: 'compare', label: t('howYouCompare'), show: !quiz.local },
    { name: 'results', label: t('results'), show: may.results },
    { name: 'guests', label: t('guests'), show: may.results && (data.guests ?? 0) > 0 },
    { name: 'grade', label: t('toGrade'), show: may.results && (data.to_grade ?? 0) + quiz.questions.filter((question) => question.type === 'written').length > 0 },
    { name: 'questions', label: t('questions'), show: may.edit },
  ];
  const active = tabs.find((held) => held.name === tab && held.show)?.name ?? '';
  return (
    <Surface>
      <Page>
        <div className="qz">
          {data.course && (
            <Link className="qz-eyebrow" to={pageHref(host, `course/${Q(data.course.id)}`)}>
              {t('quizPlace', { course: data.course.title, place: data.place ?? '', of: data.of })}
            </Link>
          )}
          {quiz.local && <LocalChip />}
          <div className="qz-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 400px', minWidth: 0 }}>
              <InlineText className="qz-h1" as="h1" label={t('quizName')} value={quiz.title} editable={may.edit} onSave={(title) => title.trim() !== '' && patch({ title })} />
            </div>
            <span className="qz-head-actions">
              {quiz.local && (
                <Button size="sm" onClick={share}>
                  {t('shareWithProject')}
                </Button>
              )}
              {/* a public link to the quiz (Academy REQ68); a host before share links has no `share` */}
              {!quiz.local && may.edit && data.askable > 0 && typeof host.share === 'function' && (
                <Button size="sm" onClick={() => host.share(quiz.path, quiz.title)}>
                  {t('share')}
                </Button>
              )}
              {may.edit && data.askable > 0 && (
                <Button size="sm" onClick={() => setMakingDeck(true)}>
                  {t('makeFlashcards')}
                </Button>
              )}
              {quiz.local && may.manage && (
                <Button size="sm" variant="quiet" onClick={remove}>
                  {t('delete')}
                </Button>
              )}
              {!quiz.local && may.manage && (
                <HeadMenu
                  items={[
                    { label: t('keepJustForMe'), run: keep, ...(may.keep_why ? { disabled: t('keepWhyStays', { why: may.keep_why }) } : {}) },
                    { label: t('delete'), run: remove, danger: true, rule: true },
                  ]}
                />
              )}
            </span>
          </div>
          <dl className="qz-props">
            {may.edit && (
              <>
                <dt>{t('course')}</dt>
                <dd>
                  <Select aria-label={t('course')} value={quiz.course ?? ''} onChange={(event: { target: HTMLSelectElement }) => patch({ course: event.target.value || null })}>
                    <option value="">-</option>
                    {sameSide.map((held) => (
                      <option key={held.id} value={held.id}>
                        {held.title}
                      </option>
                    ))}
                  </Select>
                </dd>
              </>
            )}
            {!quiz.local && (
              <>
                <dt>{t('status')}</dt>
                <dd>
                  <span className={`qz-badge${quiz.status === 'open' ? ' good' : ''}`}>{quiz.status === 'open' ? t('statusOpen') : t('closed')}</span>
                  {may.edit && (
                    <Button
                      size="sm"
                      disabled={quiz.status === 'closed' && data.askable === 0}
                      title={quiz.status === 'closed' && data.askable === 0 ? t('addQuestionFirst') : undefined}
                      onClick={() => patch({ status: quiz.status === 'open' ? 'closed' : 'open' })}
                    >
                      {quiz.status === 'open' ? t('closeQuiz') : t('openQuiz')}
                    </Button>
                  )}
                  {may.edit && data.askable === 0 && !quiz.closed && (
                    <Text tone="faint" size="sm">
                      {t('opensWithQuestion')}
                    </Text>
                  )}
                </dd>
              </>
            )}
            <dt>{t('drawsFrom')}</dt>
            <dd>
              <LinkPills
                links={quiz.draws_from}
                editable={may.edit}
                label={t('addContent')}
                picks={picks ? { blueprints: picks.blueprints, groups: [] } : null}
                onChange={(draws_from) => patch({ draws_from })}
              />
            </dd>
            {!quiz.local && (
              <>
                <dt>{t('createdBy')}</dt>
                <dd>
                  {quiz.created_by ? <UserPill alias={quiz.created_by} name={data.created_by_name} /> : <Text tone="faint">{t('unknown')}</Text>}
                  {may.manage && (
                    <span className="qz-add">
                      <Select aria-label={t('changeCreator')} value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && patch({ created_by: event.target.value })}>
                        <option value="" hidden>
                          {quiz.created_by ? t('changePick') : t('setCreatorPick')}
                        </option>
                        {data.people
                          .filter((person) => person.alias !== quiz.created_by)
                          .map((person) => (
                            <option key={person.alias} value={person.alias}>
                              {person.name} (@{person.alias})
                            </option>
                          ))}
                      </Select>
                    </span>
                  )}
                </dd>
              </>
            )}
            {may.results && (
              <>
                <dt>
                  {t('proctors')} <HelpMark tip={t('proctorsTip')} />
                </dt>
                <dd>
                  {quiz.proctors.map((alias) => (
                    <UserPill key={alias} alias={alias} name={data.proctor_names[alias]}>
                      {may.manage && (
                        <button aria-label={t('removeSource', { source: `@${alias}` })} onClick={() => patch({ proctors: quiz.proctors.filter((held) => held !== alias) })}>
                          ×
                        </button>
                      )}
                    </UserPill>
                  ))}
                  {!may.manage && quiz.proctors.length === 0 && <Text tone="faint">{t('none')}</Text>}
                  {may.manage && (
                    <span className="qz-add">
                      <Select aria-label={t('addProctor')} value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && patch({ proctors: [...quiz.proctors, event.target.value] })}>
                        <option value="" hidden>
                          {t('addProctorPick')}
                        </option>
                        {data.people
                          .filter((person) => person.alias !== quiz.created_by && !quiz.proctors.includes(person.alias))
                          .map((person) => (
                            <option key={person.alias} value={person.alias}>
                              {person.name} (@{person.alias})
                            </option>
                          ))}
                      </Select>
                    </span>
                  )}
                </dd>
              </>
            )}
          </dl>
          <nav className="qz-tabs">
            {tabs
              .filter((held) => held.show)
              .map((held) => (
                <Link key={held.name} className="qz-tab" to={pageHref(host, `quiz/${Q(id)}${held.name ? `/${held.name}` : ''}`)} aria-current={held.name === active ? 'page' : undefined}>
                  {held.label}
                  {held.name === 'guests' && (
                    <>
                      {' '}
                      <span className="qz-badge accent">{data.guests}</span>
                    </>
                  )}
                  {held.name === 'grade' && (data.to_grade ?? 0) > 0 && (
                    <>
                      {' '}
                      <span className="qz-badge accent">{data.to_grade}</span>
                    </>
                  )}
                </Link>
              ))}
          </nav>
          {active === '' && <MyScoresTab view={data} />}
          {active === 'compare' && <CompareTab id={quiz.id} />}
          {active === 'results' && <ResultsTab view={data} />}
          {active === 'guests' && <GuestsTab view={data} />}
          {active === 'grade' && <GradingTab view={data} reloadQuiz={reload} />}
          {active === 'questions' && <Builder key={quiz.id} view={data} generate={generate} reload={reload} />}
        </div>
      </Page>
      {makingDeck && (
        <NewDeck onClose={() => setMakingDeck(false)} courses={overview?.courses ?? []} quizzes={overview?.quizzes ?? []} draws={quiz.draws_from} course={quiz.course} fromQuiz={quiz.id} />
      )}
    </Surface>
  );
}

// ---- taking a quiz ----------------------------------------------------------------------------------------------

function shuffle<T>(items: T[]): T[] {
  const held = [...items];
  for (let at = held.length - 1; at > 0; at -= 1) {
    const other = Math.floor(Math.random() * (at + 1));
    [held[at], held[other]] = [held[other]!, held[at]!];
  }
  return held;
}

// An image from the project's assets, served by the Assets plugin as it serves its own.
const assetSrc = (relPath: string): string => `/api/plugins/assets/raw/${relPath.split('/').map(encodeURIComponent).join('/')}`;

// One question as it is being answered: the order its options, items, or right sides show in,
// what the person has given so far, and what they gave once it locked.
interface Asked {
  question: Question;
  order: number[];
  draft: Response | null;
  given: Response | null;
  // a written answer in practice, marked by the person (Academy REQ64)
  self: boolean | null;
}

function startOf(question: Question, shuffled: boolean): Asked {
  const indexes = (count: number): number[] => Array.from({ length: count }, (_, index) => index);
  let order: number[] = [];
  if (question.type === 'choice' || question.type === 'all') order = shuffled ? shuffle(indexes(question.options.length)) : indexes(question.options.length);
  if (question.type === 'truefalse') order = [0, 1];
  // put in order always starts out of order, or there is nothing to do
  if (question.type === 'order') {
    order = shuffle(indexes(question.items.length));
    if (order.every((index, at) => index === at) && order.length > 1) order = [...order.slice(1), order[0]!];
  }
  if (question.type === 'match') order = shuffled ? shuffle(indexes(question.pairs.length)) : indexes(question.pairs.length);
  const draft: Response | null =
    question.type === 'all'
      ? []
      : question.type === 'order'
        ? order.map((index) => question.items[index]!)
        : question.type === 'match'
          ? question.pairs.map(() => '')
          : question.type === 'short' || question.type === 'written'
            ? ''
            : null;
  return { question, order, draft, given: null, self: null };
}

// Putting items in order: each is dragged into place, or moved with its arrows from the keyboard. Once it locks, `right`
// is the order the quiz holds, and each item is marked by whether it stands in its place.
function SortAnswer({ items, right, onDraft, onGive }: { items: string[]; right: string[] | null; onDraft: (draft: Response) => void; onGive: (given: Response) => void }): JSX.Element {
  const { t } = usePluginHost();
  const list = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<string | null>(null);
  // the items as they last stood, since a drag moves them many times before the page draws again
  const latest = useRef(items);
  latest.current = items;
  const move = (from: number, to: number): void => {
    const next = [...latest.current];
    const [taken] = next.splice(from, 1);
    next.splice(to, 0, taken!);
    latest.current = next;
    onDraft(next);
  };
  const locked = right !== null;
  return (
    <>
      <div ref={list}>
        {items.map((item, index) => (
          <div
            key={item}
            className={`qz-row-item${right ? (item === right[index] ? ' correct' : ' wrong') : ' qz-sortable'}${held === item ? ' qz-held' : ''}`}
            onPointerDown={
              locked
                ? undefined
                : (event) => {
                    if (list.current && dragRow(event.nativeEvent, list.current, index, move, () => setHeld(null))) setHeld(item);
                  }
            }
          >
            {!locked && (
              <span className="qz-grip" data-grip aria-hidden>
                ⠿
              </span>
            )}
            <span className="qz-n">{index + 1}</span>
            <span className="qz-grow">{item}</span>
            {!locked && (
              <span className="qz-move">
                <Button size="sm" variant="quiet" aria-label={t('moveUp', { title: item })} disabled={index === 0} onClick={() => move(index, index - 1)}>
                  ▲
                </Button>
                <Button size="sm" variant="quiet" aria-label={t('moveDown', { title: item })} disabled={index === items.length - 1} onClick={() => move(index, index + 1)}>
                  ▼
                </Button>
              </span>
            )}
          </div>
        ))}
      </div>
      {!locked && (
        <>
          <p className="qz-muted qz-small">{t('sortHint')}</p>
          <button className="qz-btn" onClick={() => onGive(items)}>
            {t('checkAnswer')}
          </button>
        </>
      )}
    </>
  );
}

// What a person does to answer a question of each type (Academy REQ12).
function Answering({
  asked,
  kind,
  onDraft,
  onGive,
  onSelf,
}: {
  asked: Asked;
  kind: AttemptKind;
  onDraft: (draft: Response) => void;
  onGive: (given: Response) => void;
  onSelf: (self: boolean) => void;
}): JSX.Element {
  const { t } = usePluginHost();
  const { question, order, draft, given } = asked;
  const locked = given !== null;
  const right = locked ? isRight(question, given) : null;
  const optionState = (index: number): string => {
    if (!locked) return '';
    const correct = question.type === 'all' ? question.correct.includes(index) : index === question.answer;
    const chose = Array.isArray(given) ? (given as number[]).includes(index) : given === index;
    if (correct) return ' correct';
    return chose ? ' wrong' : '';
  };
  switch (question.type) {
    // a click picks an answer and Check answer gives it, so a person can think it over before it counts
    case 'choice':
    case 'truefalse': {
      const picked = typeof draft === 'number' ? draft : null;
      return (
        <>
          <div className={question.type === 'truefalse' ? 'qz-tf' : undefined}>
            {order.map((index) => (
              <button
                key={index}
                className={`qz-option${locked ? optionState(index) : picked === index ? ' on' : ''}`}
                disabled={locked}
                aria-pressed={locked ? undefined : picked === index}
                onClick={() => onDraft(index)}
              >
                {question.type === 'truefalse' ? trueFalseWord(t, question.options[index] ?? '') : question.options[index]}
              </button>
            ))}
          </div>
          {!locked && (
            <button className="qz-btn" style={{ marginTop: 14 }} disabled={picked === null} onClick={() => picked !== null && onGive(picked)}>
              {t('checkAnswer')}
            </button>
          )}
        </>
      );
    }
    case 'all': {
      const picked = (draft as number[] | null) ?? [];
      return (
        <>
          {order.map((index) => {
            const on = (locked ? (given as number[]) : picked).includes(index);
            return (
              <button
                key={index}
                className={`qz-option qz-opt${optionState(index)}`}
                disabled={locked}
                aria-pressed={on}
                onClick={() => onDraft(on ? picked.filter((held) => held !== index) : [...picked, index])}
              >
                <span className={`qz-box${on ? ' on' : ''}`} aria-hidden="true">
                  {on ? '✓' : ''}
                </span>
                <span>{question.options[index]}</span>
              </button>
            );
          })}
          {!locked && (
            <>
              <p className="qz-muted qz-small">{t('allOrNothingHint')}</p>
              <button className="qz-btn" disabled={picked.length === 0} onClick={() => onGive([...picked].sort((a, b) => a - b))}>
                {t('checkAnswer')}
              </button>
            </>
          )}
        </>
      );
    }
    case 'short':
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!locked && String(draft ?? '').trim()) onGive(String(draft));
          }}
        >
          <label className="qz-label" htmlFor="qz-short">
            {t('yourAnswer')}
          </label>
          <input
            id="qz-short"
            className={`qz-input${locked ? (right ? ' correct' : ' wrong') : ''}`}
            value={String(locked ? given : (draft ?? ''))}
            disabled={locked}
            autoComplete="off"
            onChange={(event) => onDraft(event.target.value)}
          />
          {!locked && (
            <button type="submit" className="qz-btn" style={{ marginTop: 14 }} disabled={!String(draft ?? '').trim()}>
              {t('checkAnswer')}
            </button>
          )}
        </form>
      );
    case 'order':
      return <SortAnswer items={((locked ? given : draft) as string[]) ?? []} right={locked ? question.items : null} onDraft={onDraft} onGive={onGive} />;
    case 'match': {
      const chosen = ((locked ? given : draft) as string[]) ?? [];
      return (
        <>
          {question.pairs.map((pair, index) => {
            const state = locked ? (chosen[index] === pair.right ? ' correct' : ' wrong') : '';
            return (
              <div key={index} className={`qz-row-item${state}`}>
                <span className="qz-grow">
                  <strong>{pair.left}</strong>
                  {locked && chosen[index] !== pair.right && <span className="qz-small qz-block">{t('answerIs', { answer: pair.right })}</span>}
                </span>
                <select
                  aria-label={t('whatMatches', { left: pair.left })}
                  className="qz-select"
                  value={chosen[index] ?? ''}
                  disabled={locked}
                  onChange={(event) => onDraft(chosen.map((held, at) => (at === index ? event.target.value : held)))}
                >
                  <option value="">{t('choose')}</option>
                  {order.map((at) => (
                    <option key={at} value={question.pairs[at]!.right}>
                      {question.pairs[at]!.right}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
          {!locked && (
            <>
              <p className="qz-muted qz-small">{t('matchHint')}</p>
              <button className="qz-btn" disabled={chosen.some((right) => !right)} onClick={() => onGive(chosen)}>
                {t('checkAnswer')}
              </button>
            </>
          )}
        </>
      );
    }
    case 'written':
      return (
        <>
          <label className="qz-label" htmlFor="qz-written">
            {t('yourAnswer')}
          </label>
          <textarea id="qz-written" className="qz-area" value={String(locked ? given : (draft ?? ''))} disabled={locked} onChange={(event) => onDraft(event.target.value)} />
          {!locked && (
            <button className="qz-btn" style={{ marginTop: 14 }} disabled={!String(draft ?? '').trim()} onClick={() => onGive(String(draft))}>
              {t('submit')}
            </button>
          )}
          {locked && kind === 'practice' && asked.self === null && (
            <div className="qz-actions" style={{ marginTop: 12 }}>
              <span className="qz-small qz-muted">{t('didYouGetIt')}</span>
              <button className="qz-btn secondary" onClick={() => onSelf(true)}>
                {t('iGotIt')}
              </button>
              <button className="qz-btn secondary" onClick={() => onSelf(false)}>
                {t('notQuite')}
              </button>
            </div>
          )}
        </>
      );
  }
}

// What answering shows: right or not with the reason and the reference, or for a written
// answer the model answer and what a full answer covers.
function Feedback({ asked, kind, references }: { asked: Asked; kind: AttemptKind; references: Referenced[] }): JSX.Element {
  const { t } = usePluginHost();
  const { question, given } = asked;
  if (question.type === 'written')
    return (
      <div className="qz-pending">
        {kind === 'official' ? (
          <div className="qz-row" style={{ justifyContent: 'flex-start', gap: 8 }}>
            <span className="qz-badge accent">{t('sentForGrading')}</span>
            <span className="qz-muted qz-small">{t('sentForGradingHint')}</span>
          </div>
        ) : (
          asked.self !== null && <span className={`qz-badge${asked.self ? ' good' : ''}`}>{asked.self ? t('youMarkedRight') : t('youMarkedNotQuite')}</span>
        )}
        <h3 className="qz-h3">{t('modelAnswer')}</h3>
        <div>{question.model}</div>
        {question.covers.trim() && (
          <>
            <h3 className="qz-h3">{t('fullAnswerCovers')}</h3>
            <div style={{ whiteSpace: 'pre-line' }}>{question.covers}</div>
          </>
        )}
        <ReferenceLine reference={question.reference} references={references} />
      </div>
    );
  const right = isRight(question, given!);
  return (
    <div className={`qz-feedback ${right ? 'correct' : 'wrong'}`}>
      <strong>{right ? t('correct') : t('notQuiteSentence')}</strong> {!right && question.type !== 'choice' && question.type !== 'truefalse' && <span>{t('theAnswerIs', { answer: answerWords(t, question) })} </span>}
      {question.why}
      <ReferenceLine reference={question.reference} references={references} />
    </div>
  );
}

// A quiz part way through, kept when the person leaves the take screen (to read a reference, say) so coming back to the
// same attempt picks up at the question they were on, with what they had answered. It lasts as long as the tab, through
// a reload; seeing the results or quitting forgets it.
interface Sitting {
  items: Asked[];
  position: number;
}
const sittings = new Map<string, Sitting>();
const SITTING_KEY = 'academy-sitting:';

function heldSitting(key: string): Sitting | null {
  const held = sittings.get(key);
  if (held) return held;
  try {
    const kept = sessionStorage.getItem(SITTING_KEY + key);
    const parsed = kept ? (JSON.parse(kept) as Sitting) : null;
    return parsed && Array.isArray(parsed.items) && parsed.position >= 0 && parsed.position < parsed.items.length ? parsed : null;
  } catch {
    return null;
  }
}

function keepSitting(key: string, sitting: Sitting | null): void {
  if (sitting) sittings.set(key, sitting);
  else sittings.delete(key);
  try {
    if (sitting) sessionStorage.setItem(SITTING_KEY + key, JSON.stringify(sitting));
    else sessionStorage.removeItem(SITTING_KEY + key);
  } catch {
    // without the tab's storage it is kept only until a reload
  }
}

function Take({ id, kind, mode }: { id: string; kind: AttemptKind; mode: AttemptMode }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const { data, error } = useData<QuizView>(`quiz?id=${Q(id)}`);
  useTrail(
    data
      ? [
          { label: t('academy'), href: pageHref(host, '') },
          { label: data.quiz.id, mono: true, href: pageHref(host, `quiz/${Q(id)}`) },
          { label: data.quiz.local ? t('takingTheQuiz') : kind === 'official' ? t('officialAttempt') : t('practice') },
        ]
      : null,
  );
  const sittingKey = `${id}|${kind}|${mode}`;
  // what is asked is fixed when the attempt starts, so a file changing under it never moves a question
  const [items, setItems] = useState<Asked[] | null>(() => heldSitting(sittingKey)?.items ?? null);
  const [position, setPosition] = useState(() => heldSitting(sittingKey)?.position ?? 0);
  const [finished, setFinished] = useState<Submitted | null>(null);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!data || items) return;
    const wanted = mode === 'missed' ? data.practice.missed : mode === 'unseen' ? data.practice.unseen : data.whole_quiz;
    const byId = new Map(data.quiz.questions.map((question) => [question.id, question]));
    const asked = wanted.flatMap((question) => byId.get(question) ?? []);
    // the order follows the quiz's settings, and a retry shuffles whatever they say (Academy REQ62)
    const inOrder = mode === 'whole' && !data.quiz.shuffle_questions ? asked : shuffle(asked);
    setItems(inOrder.map((question) => startOf(question, data.quiz.shuffle_options)));
  }, [data, items, mode]);

  useEffect(() => {
    if (items && !finished) keepSitting(sittingKey, { items, position });
  }, [items, position, finished, sittingKey]);

  if (error) return <Failed message={error} />;
  if (!data || !items) return <Loading />;
  const back = pageHref(host, `quiz/${Q(id)}`);

  if (data.quiz.status === 'closed' && !finished && (kind === 'official' || !data.may.edit)) {
    return (
      <Surface>
        <Page>
          <div className="qz">
            <Empty>{t('quizClosedTakeLater')}</Empty>
            <div className="qz-actions">
              <Link className="qz-btn" to={back}>
                {t('backToQuiz')}
              </Link>
            </div>
          </div>
        </Page>
      </Surface>
    );
  }

  if (items.length === 0) {
    return (
      <Surface>
        <Page>
          <div className="qz">
            <Empty>{t('nothingToAsk')}</Empty>
            <div className="qz-actions">
              <Link className="qz-btn" to={back}>
                {t('backToQuiz')}
              </Link>
            </div>
          </div>
        </Page>
      </Surface>
    );
  }

  if (finished) {
    const { attempt } = finished;
    const waiting = finished.waiting;
    return (
      <Surface>
        <Page>
          <div className="qz">
            <div className="qz-card qz-hero">
              {waiting > 0 ? (
                <span className="qz-badge accent">{t(waiting === 1 ? 'answersWaitingOne' : 'answersWaiting', { n: waiting })}</span>
              ) : (
                <>
                  {finished.first && <span className="qz-badge accent">{t('firstAttempt')}</span>}
                  {finished.new_best && <span className="qz-badge good">{t('newPersonalBest')}</span>}
                </>
              )}
              {waiting > 0 ? (
                <>
                  <div className="qz-score">
                    {attempt.score}{' '}
                    <span className="qz-score-of">
                      {t('scoreOfTotal', { n: attempt.total - attempt.answers.filter((answer) => answer.earned === null).reduce((sum, answer) => sum + answer.question.points, 0) })}
                    </span>
                  </div>
                  <div>{t('pointsSoFarGraded')}</div>
                  <div className="qz-muted qz-small" style={{ marginTop: 6 }}>
                    {t('finalOnceGraded')}
                  </div>
                </>
              ) : (
                <>
                  <div className="qz-score">{asPercent(finished.percent)}</div>
                  <div>{t(attempt.total === 1 ? 'pointsOfOne' : 'pointsOf', { earned: attempt.score, n: attempt.total })}</div>
                  <div className="qz-muted qz-small" style={{ marginTop: 6 }}>
                    <Delta change={finished.change} suffix={t('vsYourLastTry')} same={t('sameAsYourLastTry')} />
                  </div>
                </>
              )}
            </div>
            <div className="qz-stats" style={{ marginTop: 18 }}>
              <Stat
                label={t('savedAs')}
                value={<span style={{ fontSize: 26 }}>{data.quiz.local ? t('justForYou') : attempt.kind === 'official' ? t('official') : t('practice')}</span>}
                sub={attempt.kind === 'official' ? t('sharedWithProject') : t('onThisMachineOnly')}
              />
              {!data.quiz.local && (
                <Stat
                  label={t('quizAverage')}
                  value={asPercent(finished.average)}
                  sub={
                    <Link className="qz-link" to={pageHref(host, `quiz/${Q(id)}/compare`)}>
                      {t('seeHowYouCompare')}
                    </Link>
                  }
                />
              )}
              <Stat
                label={data.quiz.local ? t('attempts') : t('officialAttempts')}
                value={finished.official_attempts}
                sub={data.quiz.local ? t('wholeQuizOnMachine') : t('savedToHistory')}
              />
            </div>
            <h2 className="qz-h2">{t('review')}</h2>
            <Review attempt={attempt} references={data.references} />
            <div className="qz-actions" style={{ marginTop: 22 }}>
              <Link className="qz-btn" to={back}>
                {t('backToQuiz')}
              </Link>
              {finished.practice.missed.length > 0 && (
                <Link className="qz-btn secondary" to={`${pageHref(host, `take/${Q(id)}`)}?kind=practice&mode=missed&again=${Q(attempt.id)}`}>
                  {t('retryMissed', { n: finished.practice.missed.length })}
                </Link>
              )}
            </div>
          </div>
        </Page>
      </Surface>
    );
  }

  const item = items[position]!;
  const { question } = item;
  const answered = item.given !== null && !(question.type === 'written' && kind === 'practice' && item.self === null);
  const last = position === items.length - 1;
  const update = (patch: Partial<Asked>): void => setItems(items.map((held, at) => (at === position ? { ...held, ...patch } : held)));
  const see = async (): Promise<void> => {
    setSending(true);
    setFailure(null);
    try {
      const answers = items.map((held) => ({ question: held.question.id, response: held.given, ...(held.self !== null ? { self_marked: held.self } : {}) }));
      const submitted = await host.post<Submitted>('attempt', { quiz: id, kind, mode, answers });
      keepSitting(sittingKey, null);
      setFinished(submitted);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  };
  return (
    <Surface>
      <Page>
        <div className="qz qz-take">
          <div className="qz-row">
            <span className="qz-muted qz-small" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {data.quiz.title}
              {data.quiz.local ? (
                <span className="qz-badge">
                  <LaptopMark /> {t('justForYou')}
                </span>
              ) : kind === 'official' ? (
                <span className="qz-badge accent">{t('official')}</span>
              ) : (
                <span className="qz-badge">
                  <LaptopMark /> {t('practice')}
                </span>
              )}
              <span className="qz-badge">{t(TYPE_NAME_KEYS[question.type])}</span>
              <span className="qz-badge">{t(question.points === 1 ? 'pointCountOne' : 'pointCount', { n: question.points })}</span>
            </span>
            <span className="qz-badge accent">
              {position + 1} / {items.length}
            </span>
          </div>
          <div className="qz-progress" role="progressbar" aria-valuenow={position} aria-valuemin={0} aria-valuemax={items.length} aria-label={t('progress')}>
            <div style={{ width: `${(position / items.length) * 100}%` }} />
          </div>
          <p className="qz-prompt">{question.prompt}</p>
          {question.context.trim() && <p className="qz-context">{question.context}</p>}
          {question.image.trim() && (
            <figure className="qz-figure">
              <img src={assetSrc(question.image.trim())} alt="" />
            </figure>
          )}
          <Answering key={question.id} asked={item} kind={kind} onDraft={(draft) => update({ draft })} onGive={(given) => update({ given })} onSelf={(self) => update({ self })} />
          {item.given !== null && <Feedback asked={item} kind={kind} references={data.references} />}
          {answered && (
            <>
              {failure && (
                <div style={{ marginBottom: 12 }}>
                  <Notice tone="error">{failure}</Notice>
                </div>
              )}
              {last ? (
                <button className="qz-btn" disabled={sending} onClick={see}>
                  {sending ? '…' : t('seeResults')}
                </button>
              ) : (
                <button className="qz-btn" onClick={() => setPosition(position + 1)}>
                  {t('nextQuestion')}
                </button>
              )}
            </>
          )}
          <p style={{ marginTop: 30 }}>
            <a
              className="qz-muted qz-small"
              href={back}
              onClick={(event) => {
                keepSitting(sittingKey, null);
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                host.navigate(back);
              }}
            >
              {t('quitWithoutSaving')}
            </a>
          </p>
        </div>
      </Page>
    </Surface>
  );
}

// ---- a deck and its tabs ---------------------------------------------------------------------------------------------

// the catalog's key for each place a card stands
const STATE_LABEL: Record<Standing['state'], string> = { new: 'notYetSeen', learning: 'stillLearning', learned: 'learned' };

const studyHref = (host: PluginHost, query: Record<string, string>): string => `${pageHref(host, 'study')}?${new URLSearchParams(query).toString()}`;

// When a card or a deck was last studied, as a record of the past, never a nudge.
function lastSeen(t: PluginHost['t'], iso: string | null, got: boolean | null): string {
  if (!iso) return t('never');
  return got === null ? formatDate(iso) : t(got ? 'seenGotIt' : 'seenStillLearning', { date: formatDate(iso) });
}

function DeckProgressTab({ view }: { view: DeckView }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const { deck, progress } = view;
  const bars: Array<{ label: string; n: number; mine: boolean }> = [
    { label: t('notYetSeen'), n: progress.new, mine: false },
    { label: t('stillLearning'), n: progress.learning, mine: false },
    { label: t('learned'), n: progress.learned, mine: true },
  ];
  const tallest = Math.max(1, ...bars.map((bar) => bar.n));
  const modeLabel = (mode: StudyMode, cards: number): string => (mode === 'whole' ? t('wholeDeck') : mode === 'missed' ? t('missedOnly') : t('nextN', { n: cards }));
  const shown = Math.min(deck.per_session, view.studiable);
  return (
    <>
      <div className="qz-stats">
        <Stat hero label={t('learned')} value={t('xOfY', { n: progress.learned, of: progress.of })} sub={t('gotRightTwice')} />
        <Stat label={t('stillLearning')} value={progress.learning} sub={t('missedLately')} />
        <Stat label={t('notYetSeen')} value={progress.new} sub={t('comeAfterThose')} />
      </div>
      {view.may.study && (
        <div className="qz-actions" style={{ marginTop: 0 }}>
          <Link className="qz-btn" to={studyHref(host, { deck: deck.id })}>
            {t(shown === 1 ? 'studyCardsOne' : 'studyCards', { n: shown })}
          </Link>
          {view.missed_last > 0 && (
            <Link className="qz-btn secondary" to={studyHref(host, { deck: deck.id, mode: 'missed' })}>
              {t('studyMissed', { n: view.missed_last })}
            </Link>
          )}
          <Link className="qz-btn secondary" to={studyHref(host, { deck: deck.id, mode: 'whole' })}>
            {t('studyWholeDeck')}
          </Link>
        </div>
      )}
      <h2 className="qz-h2">{t('whereCardsStand')}</h2>
      <div className="qz-card">
        <div
          className="qz-bars"
          style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
          role="img"
          aria-label={bars.map((bar) => t('barCount', { n: bar.n, label: bar.label.toLowerCase() })).join(', ')}
        >
          {bars.map((bar) => (
            <div key={bar.label} className={`qz-bar${bar.mine ? ' you' : ''}`}>
              <span>{bar.n}</span>
              <i style={{ height: Math.round((bar.n / tallest) * 110) }} />
            </div>
          ))}
        </div>
        <div className="qz-barlabels" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {bars.map((bar) => (
            <span key={bar.label}>{bar.label}</span>
          ))}
        </div>
      </div>
      <h2 className="qz-h2">{t('history')}</h2>
      {progress.history.length === 0 ? (
        <Empty>{t('deckNotStudied')}</Empty>
      ) : (
        <div className="qz-card qz-scroll" style={{ padding: '6px 18px' }}>
          <table className="qz-table">
            <thead>
              <tr>
                <th>{t('when')}</th>
                <th>{t('studied')}</th>
                <th className="num">{t('cards')}</th>
                <th className="num">{t('stillLearning')}</th>
                <th className="num">{t('learnedAfter')}</th>
              </tr>
            </thead>
            <tbody>
              {progress.history.map((session) => (
                <tr key={session.id}>
                  <td>
                    {formatDate(session.completed_at)}{' '}
                    {!session.shared && (
                      <span title={t('onThisMachineOnly')}>
                        <LaptopMark />
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="qz-badge">{modeLabel(session.mode, session.cards)}</span>
                  </td>
                  <td className="num">{session.cards}</td>
                  <td className="num">{session.still_learning}</td>
                  <td className="num">{session.learned_after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="qz-muted qz-small">{t('deckNoScore')}</p>
    </>
  );
}

// The cards as everyone may read them, with where the person stands with each.
function CardList({ view }: { view: DeckView }): JSX.Element {
  const { t } = usePluginHost();
  const { deck, standings } = view;
  if (deck.cards.length === 0) return <Empty>{t('noCardsYet')}</Empty>;
  return (
    <div>
      {deck.cards.map((card) => {
        const standing = standings[card.id];
        return (
          <div className="qz-review" key={card.id}>
            <div className="qz-row">
              <strong style={{ flex: '1 1 300px' }}>{card.front}</strong>
              {standing && <span className={`qz-badge${standing.state === 'learned' ? ' good' : standing.state === 'new' ? ' accent' : ''}`}>{t(STATE_LABEL[standing.state])}</span>}
            </div>
            <div className="qz-small">{card.back}</div>
            {card.reference && <div className="qz-muted qz-small">{card.reference}</div>}
          </div>
        );
      })}
    </div>
  );
}

function DeckBuilder({ view, generate, reload }: { view: DeckView; generate: string | null; reload: () => void }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const act = useAct();
  const { deck, standings } = view;
  const alias = host.user?.alias ?? null;
  const [picked, setPicked] = useState<string | null>(deck.cards[0]?.id ?? null);
  const [draft, setDraft] = useState<Card | null>(null);
  const [count, setCount] = useState(generate ?? '20');
  const withQuestions = view.quizzes.filter((quiz) => quiz.questions > 0);
  const held = deck.cards.find((card) => card.id === picked) ?? null;
  const editing = draft ?? held;
  const dirty = draft !== null;
  const change = (patch: Partial<Card>): void => setDraft({ ...(editing as Card), ...patch });
  const number = editing ? (draft && !held ? [...deck.cards, draft] : deck.cards).findIndex((card) => card.id === editing.id) + 1 : 0;
  // the card being written, which leaving the page, another card, or a new one asks about first (Unsaved Changes)
  const writing = useDraft(
    {
      dirty,
      title: t('cardN', { n: number }),
      save: async () => {
        if (!draft) return true;
        await host.put(`card?id=${Q(deck.id)}`, { card: draft });
        setPicked(draft.id);
        setDraft(null);
        reload();
        return true;
      },
      discard: () => {
        setDraft(null);
        if (!held) setPicked(deck.cards[0]?.id ?? null);
      },
    },
    t('saveCardFailed'),
  );
  const add = (): void =>
    writing.leave(
      () =>
        void act(t('addCardFailed'), async () => {
          const blank = await host.post<Card>(`card/blank?id=${Q(deck.id)}`);
          setPicked(blank.id);
          setDraft(blank);
        }),
    );
  const remove = async (): Promise<void> => {
    if (!held) {
      setDraft(null);
      setPicked(deck.cards[0]?.id ?? null);
      return;
    }
    if (!(await host.dialog.confirm(t('deleteCardAsk'), { title: t('deleteCard'), ok: t('delete'), danger: true }))) return;
    await act(t('deleteCardFailed'), async () => {
      await host.del(`card?id=${Q(deck.id)}&card=${Q(held.id)}`);
      setPicked(deck.cards.find((card) => card.id !== held.id)?.id ?? null);
      setDraft(null);
      reload();
    });
  };
  const nudge = (id: string, by: number): void => {
    const ids = deck.cards.map((card) => card.id);
    const at = ids.indexOf(id);
    const [taken] = ids.splice(at, 1);
    ids.splice(at + by, 0, taken!);
    void act(t('reorderCardsFailed'), async () => {
      await host.put(`cards/order?id=${Q(deck.id)}`, { ids });
      reload();
    });
  };
  const fromQuiz = (quiz: string): void => {
    void act(t('cardsFromQuizFailed'), async () => {
      const made = await host.post<{ added: number }>(`cards/from-quiz?id=${Q(deck.id)}&quiz=${Q(quiz)}`);
      host.toast(
        made.added === 0 ? t('cardsFromQuizNone') : t(made.added === 1 ? 'cardsFromQuizAddedOne' : 'cardsFromQuizAdded', { n: made.added }),
        made.added === 0 ? 'info' : 'success',
      );
      reload();
    });
  };
  const rows = draft && !held ? [...deck.cards, draft] : deck.cards;
  const standing = held ? standings[held.id] : undefined;
  return (
    <>
      <Row justify="end" wrap gap="sm">
        <Row gap="sm" wrap>
          <span style={{ width: 70 }}>
            <Input aria-label={t('howManyCardsToGenerate')} type="number" value={count} onChange={(event: { target: HTMLInputElement }) => setCount(event.target.value)} />
          </span>
          <Generate
            label={t('generateCards')}
            title={t('cardsChatTitle', { title: deck.title })}
            text={generateCardsText(deck, Number(count) || 20, alias)}
            existing={deck.cards.length}
            noun="card"
            what="deck"
          />
          {withQuestions.length > 0 && (
            <span className="qz-add">
              <Select aria-label={t('cardsFromQuiz')} value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && fromQuiz(event.target.value)}>
                <option value="" hidden>
                  {t('cardsFromQuizPick')}
                </option>
                {withQuestions.map((quiz) => (
                  <option key={quiz.id} value={quiz.id}>
                    {t('titleWithCount', { title: quiz.title, count: t(quiz.questions === 1 ? 'questionCountOne' : 'questionCount', { n: quiz.questions }) })}
                  </option>
                ))}
              </Select>
            </span>
          )}
          <Button size="sm" onClick={add}>
            {t('addCard')}
          </Button>
        </Row>
      </Row>
      {generate && deck.cards.length === 0 && (
        <div style={{ marginTop: 12 }}>
          <Notice>{t('generateCardsNotice')}</Notice>
        </div>
      )}
      {
        <div className="qz-builder" style={{ marginTop: 14 }}>
          <div className="qz-qlist">
            {rows.map((card, index) => {
              const state = standings[card.id]?.state;
              return (
                <button
                  key={card.id}
                  className="qz-qrow"
                  aria-current={card.id === picked ? 'true' : undefined}
                  onClick={() =>
                    card.id !== picked &&
                    writing.leave(() => {
                      setPicked(card.id);
                      setDraft(null);
                    })
                  }
                >
                  <span className="qz-muted">{index + 1}</span>
                  <span className="qz-clamp" style={{ flex: 1 }}>
                    {card.front || t('newCard')}
                  </span>
                  {state && <span className={`qz-badge${state === 'new' ? ' accent' : state === 'learned' ? ' good' : ''}`}>{t(STATE_LABEL[state])}</span>}
                </button>
              );
            })}
            {rows.length === 0 && (
              <div style={{ padding: 10 }}>
                <Text tone="muted" size="sm">
                  {t('noCardsYetHint')}
                </Text>
              </div>
            )}
          </div>
          {editing && (
            <div className="qz-qform">
              <div>
                <Row justify="between" wrap gap="sm">
                  <label className="qz-label" htmlFor="qz-front" style={{ margin: 0 }}>
                    {t('front')}
                  </label>
                  <Row gap="xs" wrap>
                    {held && <Ask label={t('regenerateCard')} title={t('regenerateChatTitle', { text: held.front.slice(0, 40) })} text={regenerateCardText(deck, held)} />}
                    {held && (
                      <>
                        <Button size="sm" variant="quiet" disabled={deck.cards[0]?.id === held.id} aria-label={t('moveCardUp')} onClick={() => nudge(held.id, -1)}>
                          ▲
                        </Button>
                        <Button size="sm" variant="quiet" disabled={deck.cards.at(-1)?.id === held.id} aria-label={t('moveCardDown')} onClick={() => nudge(held.id, 1)}>
                          ▼
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="quiet" aria-label={t('deleteCard')} onClick={remove}>
                      {t('delete')}
                    </Button>
                  </Row>
                </Row>
                <div style={{ marginTop: 4 }}>
                  <Textarea id="qz-front" rows={2} value={editing.front} onChange={(event: { target: HTMLTextAreaElement }) => change({ front: event.target.value })} />
                </div>
              </div>
              <label>
                <span className="qz-label">{t('cardBack')}</span>
                <Textarea rows={3} value={editing.back} onChange={(event: { target: HTMLTextAreaElement }) => change({ back: event.target.value })} />
              </label>
              <label>
                <span className="qz-label">{t('reference')}</span>
                <Input value={editing.reference} onChange={(event: { target: HTMLInputElement }) => change({ reference: event.target.value })} />
              </label>
              <div className="qz-card qz-flash-preview">
                <span className="qz-label">{standing ? t('howItShowsSeen', { seen: lastSeen(t, standing.last_seen, standing.last_got) }) : t('howItShows')}</span>
                <div className="qz-flash-front">{editing.front || t('theFront')}</div>
                <div className="qz-flash-rule" />
                <div className="qz-small">{editing.back || t('theBack')}</div>
              </div>
              <DraftNotice draft={writing} />
              <Row justify="end" gap="sm">
                <DraftActions draft={writing} />
              </Row>
              <Text tone="faint" size="sm" block>
                {t('cardHint')}
              </Text>
            </div>
          )}
        </div>
      }
    </>
  );
}

function DeckPage({ id, tab, generate }: { id: string; tab: string; generate: string | null }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const act = useAct();
  const { data, error, reload } = useData<DeckView>(`deck?id=${Q(id)}`);
  const { data: picks } = useData<Pickable>('pickable');
  const { data: overview } = useData<Overview>('overview');
  useTrail(
    data
      ? [
          { label: t('academy'), href: pageHref(host, '') },
          ...(data.course ? [{ label: data.course.title, href: pageHref(host, `course/${Q(data.course.id)}`) }] : []),
          { label: data.deck.id, mono: true },
        ]
      : null,
  );
  if (error) return <Failed message={error} />;
  if (!data) return <Loading />;
  const { deck, may } = data;
  const patch = (body: Record<string, unknown>): void => {
    void act(t('changeDeckFailed'), async () => {
      await host.put(`deck?id=${Q(id)}`, body);
      reload();
    });
  };
  const remove = async (): Promise<void> => {
    const words = deck.local ? t('deleteLocalAsk', { title: deck.title }) : t('deleteAsk', { title: deck.title, stays: t('deleteDeckStays') });
    if (!(await host.dialog.confirm(words, { title: t('deleteDeck'), ok: t('delete'), danger: true }))) return;
    await act(t('deleteDeckFailed'), async () => {
      await host.del(`deck?id=${Q(id)}`);
      host.navigate(pageHref(host, ''));
    });
  };
  const share = async (): Promise<void> => {
    if (await shareWithProject(host, act, { kind: 'deck', id: deck.id, title: deck.title, course: deck.course ? (data.course?.title ?? null) : null })) reload();
  };
  const keep = async (): Promise<void> => {
    if (await keepJustForMe(host, act, { kind: 'deck', id: deck.id, title: deck.title })) reload();
  };
  const tabs: Array<{ name: string; label: string }> = [
    { name: '', label: t('myProgress') },
    { name: 'cards', label: t('cardsTab', { n: deck.cards.length }) },
  ];
  const active = tabs.find((held) => held.name === tab)?.name ?? '';
  const studyNow = Math.min(deck.per_session, data.studiable);
  return (
    <Surface>
      <Page>
        <div className="qz">
          {data.course ? (
            <Link className="qz-eyebrow" to={pageHref(host, `course/${Q(data.course.id)}`)}>
              {t('deckPlace', { course: data.course.title, place: data.place ?? '', of: data.of })}
            </Link>
          ) : (
            !deck.local && <span className="qz-eyebrow">{t('deck')}</span>
          )}
          {deck.local && <LocalChip />}
          <div className="qz-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 400px', minWidth: 0 }}>
              <InlineText className="qz-h1" as="h1" label={t('deckName')} value={deck.title} editable={may.edit} onSave={(title) => title.trim() !== '' && patch({ title })} />
            </div>
            <span className="qz-head-actions">
              {may.study && data.studiable > 0 && (
                <Link className="qz-btn" to={studyHref(host, { deck: deck.id })}>
                  {t(studyNow === 1 ? 'studyCardsOne' : 'studyCards', { n: studyNow })}
                </Link>
              )}
              {deck.local && (
                <Button size="sm" onClick={share}>
                  {t('shareWithProject')}
                </Button>
              )}
              {deck.local && may.manage && (
                <Button size="sm" variant="quiet" onClick={remove}>
                  {t('delete')}
                </Button>
              )}
              {!deck.local && may.manage && (
                <HeadMenu
                  items={[
                    { label: t('keepJustForMe'), run: keep, ...(may.keep_why ? { disabled: t('keepWhyStays', { why: may.keep_why }) } : {}) },
                    { label: t('delete'), run: remove, danger: true, rule: true },
                  ]}
                />
              )}
            </span>
          </div>
          <dl className="qz-props">
            {may.edit && (
              <>
                <dt>{t('course')}</dt>
                <dd>
                  <Select aria-label={t('course')} value={deck.course ?? ''} onChange={(event: { target: HTMLSelectElement }) => patch({ course: event.target.value || null })}>
                    <option value="">-</option>
                    {(overview?.courses ?? [])
                      .filter((held) => held.local === deck.local)
                      .map((held) => (
                        <option key={held.id} value={held.id}>
                          {held.title}
                        </option>
                      ))}
                  </Select>
                </dd>
              </>
            )}
            {!deck.local && (
              <>
                <dt>{t('status')}</dt>
                <dd>
                  <span className={`qz-badge${deck.status === 'open' ? ' good' : ''}`}>{deck.status === 'open' ? t('statusOpen') : t('closed')}</span>
                  {may.edit && (
                    <Button
                      size="sm"
                      disabled={deck.status === 'closed' && data.studiable === 0}
                      title={deck.status === 'closed' && data.studiable === 0 ? t('addCardFirst') : undefined}
                      onClick={() => patch({ status: deck.status === 'open' ? 'closed' : 'open' })}
                    >
                      {deck.status === 'open' ? t('closeDeck') : t('openDeck')}
                    </Button>
                  )}
                  {may.edit && data.studiable === 0 && !deck.closed && (
                    <Text tone="faint" size="sm">
                      {t('opensWithCard')}
                    </Text>
                  )}
                </dd>
              </>
            )}
            <dt>{t('drawsFrom')}</dt>
            <dd>
              <LinkPills
                links={deck.draws_from}
                editable={may.edit}
                label={t('addContent')}
                picks={picks ? { blueprints: picks.blueprints, groups: [] } : null}
                onChange={(draws_from) => patch({ draws_from })}
              />
              {data.made_from && (
                <Link className="qz-pill" to={pageHref(host, `quiz/${Q(data.made_from.id)}`)}>
                  {t('madeFromQuiz', { id: data.made_from.id })}
                </Link>
              )}
            </dd>
            <dt>{t('cardsASession')}</dt>
            <dd>
              {may.edit ? (
                <span style={{ width: 80 }}>
                  <Input
                    aria-label={t('cardsASession')}
                    type="number"
                    defaultValue={String(deck.per_session)}
                    onBlur={(event: { target: HTMLInputElement }) => {
                      const size = Number(event.target.value);
                      if (Number.isInteger(size) && size > 0 && size !== deck.per_session) patch({ per_session: size });
                    }}
                  />
                </span>
              ) : (
                deck.per_session
              )}
            </dd>
            <dt>{t('lastStudied')}</dt>
            <dd>{data.progress.last_studied ? formatDate(data.progress.last_studied) : <Text tone="faint">{t('notYet')}</Text>}</dd>
            {!deck.local && (
              <>
                <dt>{t('createdBy')}</dt>
                <dd>
                  {deck.created_by ? <UserPill alias={deck.created_by} name={data.created_by_name} /> : <Text tone="faint">{t('unknown')}</Text>}
                  {may.manage && (
                    <span className="qz-add">
                      <Select aria-label={t('changeCreator')} value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && patch({ created_by: event.target.value })}>
                        <option value="" hidden>
                          {deck.created_by ? t('changePick') : t('setCreatorPick')}
                        </option>
                        {data.people
                          .filter((person) => person.alias !== deck.created_by)
                          .map((person) => (
                            <option key={person.alias} value={person.alias}>
                              {person.name} (@{person.alias})
                            </option>
                          ))}
                      </Select>
                    </span>
                  )}
                </dd>
              </>
            )}
            {may.edit && !deck.local && (
              <>
                <dt>
                  {t('editors')} <HelpMark tip={t('editorsTip')} />
                </dt>
                <dd>
                  {deck.proctors.map((alias) => (
                    <UserPill key={alias} alias={alias} name={data.proctor_names[alias]}>
                      {may.manage && (
                        <button aria-label={t('removeSource', { source: `@${alias}` })} onClick={() => patch({ proctors: deck.proctors.filter((held) => held !== alias) })}>
                          ×
                        </button>
                      )}
                    </UserPill>
                  ))}
                  {!may.manage && deck.proctors.length === 0 && <Text tone="faint">{t('none')}</Text>}
                  {may.manage && (
                    <span className="qz-add">
                      <Select aria-label={t('addEditor')} value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && patch({ proctors: [...deck.proctors, event.target.value] })}>
                        <option value="" hidden>
                          {t('addEditorPick')}
                        </option>
                        {data.people
                          .filter((person) => person.alias !== deck.created_by && !deck.proctors.includes(person.alias))
                          .map((person) => (
                            <option key={person.alias} value={person.alias}>
                              {person.name} (@{person.alias})
                            </option>
                          ))}
                      </Select>
                    </span>
                  )}
                </dd>
              </>
            )}
          </dl>
          <nav className="qz-tabs">
            {tabs.map((held) => (
              <Link key={held.name} className="qz-tab" to={pageHref(host, `deck/${Q(id)}${held.name ? `/${held.name}` : ''}`)} aria-current={held.name === active ? 'page' : undefined}>
                {held.label}
              </Link>
            ))}
          </nav>
          {active === '' && <DeckProgressTab view={data} />}
          {active === 'cards' && (may.edit ? <DeckBuilder key={deck.id} view={data} generate={generate} reload={reload} /> : <CardList view={data} />)}
        </div>
      </Page>
    </Surface>
  );
}

// ---- studying a deck -------------------------------------------------------------------------------------------------

// One sitting: the cards fixed when it starts, a card answered Still learning shown once more at
// its end, and every answer kept in order. Stopping keeps the cards answered so far. The sitting
// lives in a ref each answer changes at once, so answers given faster than a render are never lost.
function Study({ deck, course, mode }: { deck: string | null; course: string | null; mode: StudyMode }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const query = new URLSearchParams({ ...(deck ? { deck } : {}), ...(course ? { course } : {}), mode });
  const { data, error } = useData<StudyView>(`study?${query.toString()}`);
  const sitting = useRef<{ queue: number[]; position: number; flipped: boolean; answers: Array<{ deck: string; card: string; got: boolean; at: string }>; again: Set<number>; saving: boolean } | null>(
    null,
  );
  const [, redraw] = useState(0);
  const [finished, setFinished] = useState<Studied | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(new Date().toISOString());
  const back = deck ? pageHref(host, `deck/${Q(deck)}`) : course ? pageHref(host, `course/${Q(course)}`) : pageHref(host, 'keep-studying');
  useTrail(
    data
      ? [
          { label: t('academy'), href: pageHref(host, '') },
          ...(deck ? [{ label: deck, mono: true, href: back }] : [{ label: t('keepStudying'), href: pageHref(host, 'keep-studying') }]),
          { label: finished ? t('sessionDone') : t('studying') },
        ]
      : null,
  );
  if (data && sitting.current === null) sitting.current = { queue: data.cards.map((_, index) => index), position: 0, flipped: false, answers: [], again: new Set(), saving: false };
  const now = sitting.current;

  const save = async (): Promise<void> => {
    const held = sitting.current;
    if (!held || held.saving) return;
    if (held.answers.length === 0) {
      host.navigate(back);
      return;
    }
    held.saving = true;
    setFailure(null);
    redraw((turn) => turn + 1);
    try {
      setFinished(await host.post<Studied>('study', { mode, started_at: started.current, answers: held.answers }));
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      held.saving = false;
      redraw((turn) => turn + 1);
    }
  };
  const flip = (): void => {
    const held = sitting.current;
    if (!held || held.flipped || held.saving || held.position >= held.queue.length) return;
    held.flipped = true;
    redraw((turn) => turn + 1);
  };
  const answer = (got: boolean): void => {
    const held = sitting.current;
    if (!data || !held || !held.flipped || held.saving || held.position >= held.queue.length) return;
    const index = held.queue[held.position]!;
    const shown = data.cards[index]!;
    held.answers.push({ deck: shown.deck, card: shown.card.id, got, at: new Date().toISOString() });
    // a card missed comes back once at the end of the sitting
    if (!got && !held.again.has(index)) {
      held.queue.push(index);
      held.again.add(index);
    }
    held.flipped = false;
    held.position += 1;
    redraw((turn) => turn + 1);
    if (held.position >= held.queue.length) void save();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
      if (document.querySelector('[data-slot=backdrop]')) return;
      const held = sitting.current;
      if (!held) return;
      if (event.key === ' ' || event.key === 'Enter') {
        if (held.flipped) return;
        event.preventDefault();
        flip();
      } else if (event.key === '1' || event.key === '2') {
        event.preventDefault();
        answer(event.key === '2');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (error) return <Failed message={error} />;
  if (!data || !now) return <Loading />;

  if (finished) return <StudyDone studied={finished} deck={deck} course={course} back={back} />;

  if (data.cards.length === 0) {
    return (
      <Surface>
        <Page>
          <div className="qz">
            <Empty>{mode === 'missed' ? t('missedNothing') : t('noCardsToStudy')}</Empty>
            <div className="qz-actions">
              <Link className="qz-btn" to={back}>
                {t('back')}
              </Link>
            </div>
          </div>
        </Page>
      </Surface>
    );
  }

  const total = now.queue.length;
  const current = now.position < total ? data.cards[now.queue[now.position]!] : undefined;
  const flipped = now.flipped;
  const answered = now.answers.length;
  return (
    <Surface>
      <Page>
        <div className="qz" style={{ maxWidth: 760 }}>
          <div className="qz-row">
            <span className="qz-muted qz-small" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {current?.deck_title ?? data.title}
              {current && (
                <span className={`qz-badge${current.state === 'new' ? ' accent' : ''}`}>
                  {current.state === 'new' ? t('stateNew') : current.state === 'learned' ? t('learned') : t('stateLearning')}
                </span>
              )}
            </span>
            <span className="qz-badge accent">{t('xOfY', { n: Math.min(now.position + 1, total), of: total })}</span>
          </div>
          <div className="qz-progress" role="progressbar" aria-valuenow={now.position} aria-valuemin={0} aria-valuemax={total} aria-label={t('progress')}>
            <div style={{ width: `${(now.position / total) * 100}%` }} />
          </div>
          {current ? (
            <button className="qz-card qz-flash" disabled={flipped} aria-label={flipped ? t('answerShowing') : t('showAnswer')} onClick={flip}>
              <span className="qz-flash-front">{current.card.front}</span>
              {flipped ? (
                <>
                  <span className="qz-flash-rule" />
                  <span className="qz-flash-back">{current.card.back}</span>
                  {current.card.reference && <span className="qz-muted qz-small">{current.card.reference}</span>}
                </>
              ) : (
                <span className="qz-muted qz-small">{t('flipHint')}</span>
              )}
            </button>
          ) : (
            !failure && (
              <p className="qz-muted" style={{ marginTop: 18, textAlign: 'center' }}>
                {t('savingSession')}
              </p>
            )
          )}
          {failure && (
            <div style={{ marginTop: 12 }}>
              <Notice tone="error">{failure}</Notice>
              <button className="qz-btn" disabled={now.saving} onClick={() => void save()}>
                {t('trySavingAgain')}
              </button>
            </div>
          )}
          {flipped && current && (
            <>
              <div className="qz-grades">
                <button className="qz-option" disabled={now.saving} onClick={() => answer(false)}>
                  <strong>{t('stillLearning')}</strong>
                  <span className="qz-muted qz-small">{now.again.has(now.queue[now.position]!) ? t('comesBackNextTime') : t('comesBackLater')}</span>
                </button>
                <button className="qz-option" disabled={now.saving} onClick={() => answer(true)}>
                  <strong>{t('gotIt')}</strong>
                  <span className="qz-muted qz-small">{t('countsTowardLearned')}</span>
                </button>
              </div>
              <p className="qz-muted qz-small" style={{ marginTop: 10, textAlign: 'center' }}>
                {t('studyKeysHint')}
              </p>
            </>
          )}
          {current && (
            <p style={{ marginTop: 30 }}>
              <button className="qz-quiet-link qz-muted qz-small" disabled={now.saving} onClick={() => void save()}>
                {answered > 0 ? t(answered === 1 ? 'stopKeptOne' : 'stopKept', { n: answered }) : t('stopForNow')}
              </button>
            </p>
          )}
        </div>
      </Page>
    </Surface>
  );
}

function StudyDone({ studied, deck, course, back }: { studied: Studied; deck: string | null; course: string | null; back: string }): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const one = studied.decks.length === 1 ? studied.decks[0]! : null;
  const learned = studied.decks.reduce((sum, held) => sum + held.learned, 0);
  const of = studied.decks.reduce((sum, held) => sum + held.of, 0);
  const gained = studied.decks.reduce((sum, held) => sum + held.gained, 0);
  const left = studied.decks.reduce((sum, held) => sum + held.left, 0);
  const again = Date.now().toString(36);
  return (
    <Surface>
      <Page>
        <div className="qz">
          <div className="qz-card qz-hero">
            <span className="qz-badge good">{t('sessionDone')}</span>
            <div className="qz-score">{studied.cards}</div>
            <div>
              {t(studied.cards === 1 ? 'studiedInOne' : 'studiedIn', {
                minutes: t(studied.minutes === 1 ? 'minuteCountOne' : 'minuteCount', { n: studied.minutes }),
              })}
            </div>
            <div className="qz-muted qz-small" style={{ marginTop: 6 }}>
              {left === 0
                ? t('everyCardLearned')
                : one
                  ? t(left === 1 ? 'leftInDeckOne' : 'leftInDeck', { n: left })
                  : t(left === 1 ? 'leftAcrossDecksOne' : 'leftAcrossDecks', { n: left })}
            </div>
          </div>
          <div className="qz-stats" style={{ marginTop: 18 }}>
            <Stat label={t('gotIt')} value={studied.got} sub={t('ofTheStudied', { n: studied.cards })} />
            <Stat label={t('stillLearning')} value={studied.still_learning} sub={t('comeFirstNextTime')} />
            <Stat
              label={t('learned')}
              value={t('xOfY', { n: learned, of })}
              sub={gained > 0 ? <span className="qz-up">{t('gainedThisSession', { n: gained })}</span> : t('gotRightTwice')}
            />
          </div>
          <div className="qz-card qz-row" style={{ padding: '14px 18px', justifyContent: 'flex-start' }}>
            {studied.shared ? (
              <>
                <span className="qz-badge accent">{t('shared')}</span>
                <span className="qz-small" style={{ flex: '1 1 300px' }}>
                  {t('sessionSharedHint')}
                </span>
              </>
            ) : (
              <>
                <span className="qz-badge">
                  <LaptopMark /> {t('local')}
                </span>
                <span className="qz-small" style={{ flex: '1 1 300px' }}>
                  {t('sessionLocalHint')}
                </span>
              </>
            )}
          </div>
          {studied.missed.length > 0 && (
            <>
              <h2 className="qz-h2">{t('onesYouMissed')}</h2>
              {studied.missed.map((card, index) => (
                <div className="qz-review" key={index}>
                  <span className="qz-no">{t('stillLearning')}</span> {card.front}
                  <div className="qz-muted qz-small">{card.back}</div>
                </div>
              ))}
            </>
          )}
          <div className="qz-actions" style={{ marginTop: 22 }}>
            <Link className="qz-btn" to={studyHref(host, { ...(deck ? { deck } : {}), ...(course ? { course } : {}), again })}>
              {t('keepGoing')}
            </Link>
            {deck && studied.missed.length > 0 && (
              <Link className="qz-btn secondary" to={studyHref(host, { deck, mode: 'missed', again })}>
                {t('studyMissed', { n: studied.missed.length })}
              </Link>
            )}
            <Link className="qz-btn secondary" to={back}>
              {deck ? t('backToDeck') : course ? t('backToCourse') : t('backToKeepStudying')}
            </Link>
          </div>
          <p className="qz-muted qz-small" style={{ marginTop: 10 }}>
            {t('studyWhenever')}
          </p>
        </div>
      </Page>
    </Surface>
  );
}

// ---- Keep studying -----------------------------------------------------------------------------------------------------

function KeepStudying(): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const { data, error } = useData<KeepView>('keep-studying');
  const { data: overview } = useData<Overview>('overview');
  const [making, setMaking] = useState(false);
  useTrail([{ label: t('academy'), href: pageHref(host, '') }, { label: t('keepStudying') }]);
  if (error) return <Failed message={error} />;
  if (!data) return <Loading />;
  const toLearn = data.learning + data.unseen;
  return (
    <Surface>
      <Page>
        <div className="qz">
          <span className="qz-eyebrow">{t('pickUp')}</span>
          <div className="qz-row" style={{ alignItems: 'flex-start' }}>
            <h1 className="qz-h1" style={{ flex: '1 1 400px' }}>
              {data.decks.length === 0 ? (
                t('noDecksYet')
              ) : toLearn === 0 ? (
                <>
                  <span>{t('everyCard')}</span> {t('isLearned')}
                </>
              ) : (
                <>
                  <span>{t(toLearn === 1 ? 'cardCountOne' : 'cardCount', { n: toLearn })}</span> {t('stillToLearn')}
                </>
              )}
            </h1>
            {data.decks.length > 0 && data.may_study && (
              <Link className="qz-btn" to={pageHref(host, 'study')}>
                {t('studyAcrossDecks')}
              </Link>
            )}
          </div>
          {data.decks.length === 0 ? (
            <>
              <p className="qz-muted">{t('deckIntro')}</p>
              <div className="qz-actions">
                <button className="qz-btn" onClick={() => setMaking(true)}>
                  {t('newDeck')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="qz-muted" style={{ margin: 0 }}>
                {t('keepStudyingIntro')}
              </p>
              <div className="qz-stats" style={{ marginTop: 18 }}>
                <Stat hero label={t('stillLearning')} value={data.learning} sub={t('cardsMissedLately')} />
                <Stat label={t('notYetSeen')} value={data.unseen} sub={t('acrossYourDecks')} />
                <Stat label={t('learned')} value={t('xOfY', { n: data.learned, of: data.cards })} sub={t('gotRightTwice')} />
              </div>
              <h2 className="qz-h2">{t('byDeck')}</h2>
              {data.decks.map((row) => (
                <div className="qz-card qz-quiz" key={row.id}>
                  <span style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <Link to={pageHref(host, `deck/${Q(row.id)}`)} style={{ display: 'block', fontWeight: 600 }}>
                      {row.title}
                    </Link>
                    <span className="qz-muted qz-small">
                      {row.local && (
                        <span className="qz-chip-local">
                          <LaptopMark /> {t('local')} ·{' '}
                        </span>
                      )}
                      {row.course_title ?? t('oneOffDeck')} · {t('learnedOf', { learned: row.learned, of: row.cards })} ·{' '}
                      {row.last_studied ? t('lastStudiedOn', { date: formatDate(row.last_studied) }) : t('notStudiedYet')}
                    </span>
                  </span>
                  {row.learning > 0 && <span className="qz-badge">{t('stillLearningCount', { n: row.learning })}</span>}
                  {row.unseen > 0 && <span className="qz-badge accent">{t('notYetSeenBadge', { n: row.unseen })}</span>}
                  {row.learning === 0 && row.unseen === 0 && row.cards > 0 && <span className="qz-badge good">{t('allLearned')}</span>}
                  {row.status === 'closed' && !row.may_edit ? (
                    <span className="qz-badge">{t('closed')}</span>
                  ) : (
                    <Link className="qz-btn secondary" to={studyHref(host, { deck: row.id })}>
                      {t('study')}
                    </Link>
                  )}
                </div>
              ))}
              <p className="qz-muted qz-small">{t('nothingWaitsOnDate')}</p>
            </>
          )}
        </div>
      </Page>
      {making && <NewDeck onClose={() => setMaking(false)} courses={overview?.courses ?? []} quizzes={overview?.quizzes ?? []} draws={[]} course={null} fromQuiz={null} />}
    </Surface>
  );
}

// ---- beside a blueprint --------------------------------------------------------------------------------------------

function BesideBlueprint(): JSX.Element {
  const host = usePluginHost();
  const { t } = host;
  const act = useAct();
  const open = useOpen() as { kind?: string; id?: string };
  const id = open.kind === 'blueprint' ? (open.id ?? null) : null;
  const { data, reload } = useData<{ quizzes: Row_[]; decks: DeckRow_[]; plan: { course: string; place: number; of: number; sessions_done: number; done: boolean } | null }>(
    id ? `blueprint?id=${Q(id)}` : null,
  );
  const { data: overview } = useData<Overview>('overview');
  const [making, setMaking] = useState<'quiz' | 'deck' | null>(null);
  return (
    <Surface>
      <div className="qz-aux">
        <Stack gap="sm">
          {data?.quizzes.map((row) => (
            <div className="qz-card" key={row.id} style={{ padding: '11px 12px' }}>
              <Link to={pageHref(host, `quiz/${Q(row.id)}`)} style={{ fontWeight: 500 }}>
                {row.title}
              </Link>
              <div className="qz-muted qz-small">
                {row.local && (
                  <span className="qz-chip-local">
                    <LaptopMark /> {t('local')} ·{' '}
                  </span>
                )}
                {t('besideQuiz', {
                  best: row.best === null ? t('notYetTaken') : t('yourBest', { percent: asPercent(row.best) }),
                  questions: t(row.questions === 1 ? 'questionCountOne' : 'questionCount', { n: row.questions }),
                })}
              </div>
              <div style={{ marginTop: 8 }}>
                {row.status === 'closed' ? (
                  <span className="qz-badge">{t('closed')}</span>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => host.navigate(pageHref(host, `quiz/${Q(row.id)}`))}>
                    {row.best === null ? t('take') : t('retake')}
                  </Button>
                )}
              </div>
            </div>
          ))}
          {data?.decks.map((row) => (
            <div className="qz-card" key={row.id} style={{ padding: '11px 12px' }}>
              <Link to={pageHref(host, `deck/${Q(row.id)}`)} style={{ fontWeight: 500 }}>
                {row.title}
              </Link>
              <div className="qz-muted qz-small">
                {row.local && (
                  <span className="qz-chip-local">
                    <LaptopMark /> {t('local')} ·{' '}
                  </span>
                )}
                {t('besideDeck', {
                  learned: row.learned + row.learning === 0 ? t('notYetStudied') : t('learnedOf', { learned: row.learned, of: row.cards }),
                  cards: t(row.cards === 1 ? 'cardCountOne' : 'cardCount', { n: row.cards }),
                })}
              </div>
              <div style={{ marginTop: 8 }}>
                {row.status === 'closed' ? (
                  <span className="qz-badge">{t('closed')}</span>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => host.navigate(`${pageHref(host, 'study')}?deck=${Q(row.id)}`)}>
                    {t('study')}
                  </Button>
                )}
              </div>
            </div>
          ))}
          {data && data.quizzes.length === 0 && data.decks.length === 0 && (
            <Text tone="muted" size="sm" block>
              {t('besideEmpty')}
            </Text>
          )}
          <div>
            <Button size="sm" variant="quiet" disabled={!id} onClick={() => setMaking('quiz')}>
              {t('newQuizFromThis')}
            </Button>
            <Button size="sm" variant="quiet" disabled={!id} onClick={() => setMaking('deck')}>
              {t('newDeckFromThis')}
            </Button>
          </div>
          {data?.plan && (
            <div>
              <div className="qz-small qz-muted">{t('planSession', { course: data.plan.course, place: data.plan.place, of: data.plan.of, done: data.plan.sessions_done })}</div>
              <div className="qz-progress" style={{ margin: '6px 0 10px' }}>
                <div style={{ width: `${(data.plan.sessions_done / Math.max(1, data.plan.of)) * 100}%` }} />
              </div>
              <Button
                size="sm"
                onClick={() =>
                  void act(t('markSessionFailed'), async () => {
                    await host.put(`session?blueprint=${Q(id!)}`, { done: !data.plan!.done });
                    reload();
                  })
                }
              >
                {data.plan.done ? t('markSessionNotDone') : t('markSessionDone')}
              </Button>
            </div>
          )}
        </Stack>
      </div>
      {making === 'quiz' && id && <NewQuiz onClose={() => setMaking(null)} courses={overview?.courses ?? []} draws={[id]} course={null} />}
      {making === 'deck' && id && <NewDeck onClose={() => setMaking(null)} courses={overview?.courses ?? []} quizzes={overview?.quizzes ?? []} draws={[id]} course={null} fromQuiz={null} />}
    </Surface>
  );
}

// ---- the page half --------------------------------------------------------------------------------------------------

function Route({ segments, query }: { segments: string[]; query: URLSearchParams }): JSX.Element {
  const [kind, id, tab, person] = segments.map((segment) => decodeURIComponent(segment));
  if (kind === 'start') {
    const made = query.get('made');
    return made ? <StartClosing made={made} deck={query.get('kind') === 'deck'} course={query.get('course')} generate={query.get('generate')} /> : <GetStarted />;
  }
  if (kind === 'my-courses') return <MyCourses />;
  if (kind === 'keep-studying') return <KeepStudying />;
  if (kind === 'deck' && id) return <DeckPage key={id} id={id} tab={tab ?? ''} generate={query.get('generate')} />;
  if (kind === 'study') {
    const mode = query.get('mode');
    const wanted: StudyMode = mode === 'missed' || mode === 'whole' ? mode : 'next';
    return <Study key={`${query.get('deck') ?? ''}/${query.get('course') ?? ''}/${wanted}/${query.get('again') ?? ''}`} deck={query.get('deck')} course={query.get('course')} mode={wanted} />;
  }
  if (kind === 'course' && id) return <CoursePage key={id} id={id} tab={tab ?? ''} person={person ?? null} />;
  if (kind === 'quiz' && id) return <QuizPage key={id} id={id} tab={tab ?? ''} generate={query.get('generate')} />;
  if (kind === 'take' && id) {
    const wanted = query.get('kind') === 'official' ? 'official' : 'practice';
    const modeAsked = query.get('mode');
    const mode: AttemptMode = wanted === 'official' ? 'whole' : modeAsked === 'missed' || modeAsked === 'unseen' ? modeAsked : 'whole';
    return <Take key={`${id}/${wanted}/${mode}/${query.get('again') ?? ''}`} id={id} kind={wanted} mode={mode} />;
  }
  return <QuizList show={query.get('show')} />;
}

function QuizIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-4 9 4-9 4zM7 11v4c0 1.5 2.5 3 5 3s5-1.5 5-3v-4M21 9v5" />
    </svg>
  );
}

export const page: PagePlugin = {
  name: 'academy',
  strings: PAGE_STRINGS,
  views: [
    { sector: 'primary', name: 'main', title: 'Academy', icon: QuizIcon, render: () => <Sidebar /> },
    { sector: 'auxiliary', name: 'beside', title: 'Academy', icon: QuizIcon, render: () => <BesideBlueprint />, when: (open: { kind?: string }) => open.kind === 'blueprint' },
  ],
  pages: [{ path: '', render: (route: { segments: string[]; query: URLSearchParams }) => <Route segments={route.segments} query={route.query} /> }],
  slashCommands: [
    {
      name: 'quiz',
      description: 'Generate a quiz from what is open, or from what you name',
      run: (chat: { args: string; open: { kind?: string; id?: string }; send: (text: string) => void }) => {
        const about = chat.args || (chat.open.kind === 'blueprint' && chat.open.id ? `the blueprint ${chat.open.id}` : 'ask me what it should cover');
        chat.send(
          `Generate a multiple-choice quiz on ${about}. Run \`eidos instructions academy\` first and follow what it says about writing questions. Start it with \`eidos academy quiz new\`, naming what it draws from, and ask me which course it belongs in if the project has any.`,
        );
      },
    },
    {
      name: 'flashcards',
      description: 'Write a deck of flashcards from what is open, or from what you name',
      run: (chat: { args: string; open: { kind?: string; id?: string }; send: (text: string) => void }) => {
        const about = chat.args || (chat.open.kind === 'blueprint' && chat.open.id ? `the blueprint ${chat.open.id}` : 'ask me what it should cover');
        chat.send(
          `Write a deck of flashcards on ${about}. Run \`eidos instructions academy\` first and follow what it says about writing cards. Start it with \`eidos academy deck new\`, naming what it draws from, and ask me which course it belongs in if the project has any.`,
        );
      },
    },
    {
      name: 'study-plan',
      description: 'Build a study plan for a book, a textbook, or online content',
      run: (chat: { args: string; open: { kind?: string; id?: string }; send: (text: string) => void }) => {
        chat.send(studyPlanText(chat.args || (chat.open.kind === 'blueprint' && chat.open.id ? `the blueprint ${chat.open.id}` : 'what I am about to name')));
      },
    },
  ],
};
