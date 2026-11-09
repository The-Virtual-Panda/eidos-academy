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
import { asPercent, ContextMenu, Delta, Failed, formatDate, HelpMark, LaptopMark, Loading, Stat, Surface, useAct, useData, UserPill, useTrail, type MenuEntry } from './page-kit.tsx';
import type { Attempt, AttemptKind, AttemptMode, Card, Comparison, Course, CourseProgress, Deck, DeckProgress, MyScores, PersonResult, Question, Quiz, StudyMode } from './model.ts';

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
  may_edit: boolean;
  may_manage: boolean;
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
}
interface Overview {
  me: { name: string; alias: string | null; owner: boolean } | null;
  folder: string;
  quizzes: Row_[];
  decks: DeckRow_[];
  quizzes_left: { folder: string | null; quizzes: number; results: number; may_move: boolean } | null;
  courses: Array<{ id: string; title: string; created_by: string | null; enrolled: boolean; may_edit: boolean }>;
}
interface QuizView {
  quiz: Quiz;
  created_by_name: string | null;
  proctor_names: Record<string, string | null>;
  askable: number;
  course: { id: string; title: string } | null;
  place: number | null;
  of: number;
  may: { edit: boolean; manage: boolean; results: boolean; take_official: boolean; official_why: string | null };
  scores: MyScores;
  practice: { missed: string[]; unseen: string[] };
  whole_quiz: string[];
  people: Array<{ alias: string; name: string }>;
}
interface Pickable {
  blueprints: Array<{ id: string; title: string; rel?: string }>;
  groups: string[];
}
interface CourseView {
  course: Course;
  created_by_name: string | null;
  may: { edit: boolean; people: boolean; enroll: boolean; enroll_why: string | null };
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
  enrolled_since: string;
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
  may: { edit: boolean; manage: boolean; study: boolean; shared: boolean };
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

function agentOf(host: PluginHost): AgentPageApi | undefined {
  return host.plugin<AgentPageApi>('agent');
}

// The agent's button where it is there; with no AI Agent, a line saying the builder works by hand.
function Ask({ label, title, text }: { label: string; title: string; text: string }): JSX.Element {
  const host = usePluginHost();
  const agent = agentOf(host);
  if (!agent)
    return (
      <Button disabled size="sm" variant="accent" title="Turn on the AI Agent plugin to generate questions; you can still write them by hand">
        {label}
      </Button>
    );
  const AskAgent = agent.AskAgent;
  return <AskAgent label={label} title={title} text={text} />;
}

// ---- the agent's openings -----------------------------------------------------------------

function generateText(quiz: Quiz, count: number, alias: string | null): string {
  return [
    `Generate ${count} multiple-choice questions for the quiz ${quiz.id}, "${quiz.title}".`,
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
  const copyId = (id: string): MenuEntry => ({ label: 'Copy id', run: () => void navigator.clipboard?.writeText(id), rule: true });
  const newQuiz: MenuEntry = { label: 'New quiz', run: () => setMaking('quiz') };
  const newCourse: MenuEntry = { label: 'New course', run: () => setMaking('course') };
  const newDeck: MenuEntry = { label: 'New deck', run: () => setMaking('deck') };
  const rename = (what: string, title: string, route: string): MenuEntry => ({
    label: 'Rename',
    run: async () => {
      const next = await host.dialog.prompt(`A new name for this ${what}`, { title: `Rename ${what}`, value: title, ok: 'Rename' });
      if (next && next.trim() && next !== title) await act(`Could not rename the ${what}`, () => host.put(route, { title: next }));
    },
  });
  const courseMenu = (course: Overview['courses'][number]): MenuEntry[] => {
    const page = pageHref(host, `course/${Q(course.id)}`);
    return [
      go('Open', page),
      ...(course.enrolled ? [go('My progress', `${page}/progress`)] : []),
      ...(course.may_edit ? [go('Enrolled', `${page}/people`)] : []),
      copyId(course.id),
      course.enrolled
        ? { label: 'Leave course', run: () => void act('Could not leave the course', () => host.del(`course/enroll?id=${Q(course.id)}`)) }
        : { label: 'Enroll', run: () => void act('Could not enroll', () => host.post(`course/enroll?id=${Q(course.id)}`)) },
      ...(course.may_edit
        ? [
            rename('course', course.title, `course?id=${Q(course.id)}`),
            {
              label: 'Delete',
              danger: true,
              rule: true,
              run: async () => {
                const held = quizzes.filter((row) => row.course === course.id).length;
                const decksIn = decks.filter((row) => row.course === course.id).length;
                if (await host.dialog.confirm(`Delete ${course.title}? Its ${held} quizzes and ${decksIn} decks stay, as one-offs.`, { title: 'Delete course', ok: 'Delete', danger: true })) {
                  await act('Could not delete the course', () => host.del(`course?id=${Q(course.id)}`));
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
      go('Open', page),
      ...(row.status === 'open' ? [go('Take officially', `${take}?kind=official&mode=whole`)] : []),
      ...(canPractice ? [go('Practice', `${take}?kind=practice&mode=whole`)] : []),
      ...(row.may_edit ? [go('Questions', `${page}/questions`)] : []),
      copyId(row.id),
      ...(row.may_edit && row.questions > 0
        ? [
            {
              label: row.status === 'open' ? 'Close quiz' : 'Open quiz',
              run: () => void act('Could not change the quiz', () => host.put(`quiz?id=${Q(row.id)}`, { status: row.status === 'open' ? 'closed' : 'open' })),
            },
          ]
        : []),
      ...(row.may_edit ? [rename('quiz', row.title, `quiz?id=${Q(row.id)}`)] : []),
      ...(row.may_manage
        ? [
            {
              label: 'Delete',
              danger: true,
              rule: true,
              run: async () => {
                if (await host.dialog.confirm(`Delete ${row.title}? The results people already have stay in their history.`, { title: 'Delete quiz', ok: 'Delete', danger: true })) {
                  await act('Could not delete the quiz', () => host.del(`quiz?id=${Q(row.id)}`));
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
      go('Open', page),
      ...(row.cards > 0 && (row.status === 'open' || row.may_edit) ? [go('Study', `${pageHref(host, 'study')}?deck=${Q(row.id)}`)] : []),
      ...(row.may_edit ? [go('Cards', `${page}/cards`)] : []),
      copyId(row.id),
      ...(row.may_edit && row.cards > 0
        ? [
            {
              label: row.status === 'open' ? 'Close deck' : 'Open deck',
              run: () => void act('Could not change the deck', () => host.put(`deck?id=${Q(row.id)}`, { status: row.status === 'open' ? 'closed' : 'open' })),
            },
          ]
        : []),
      ...(row.may_edit ? [rename('deck', row.title, `deck?id=${Q(row.id)}`)] : []),
      ...(row.may_manage
        ? [
            {
              label: 'Delete',
              danger: true,
              rule: true,
              run: async () => {
                if (await host.dialog.confirm(`Delete ${row.title}? People's study sessions with it stay in their history.`, { title: 'Delete deck', ok: 'Delete', danger: true })) {
                  await act('Could not delete the deck', () => host.del(`deck?id=${Q(row.id)}`));
                }
              },
            },
          ]
        : []),
    ];
  };
  const entry = (label: string, to: string, items: MenuEntry[], count?: number | string): JSX.Element => (
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
      {count !== undefined && <NavCount>{count}</NavCount>}
    </NavLink>
  );
  const root = pageHref(host, '');
  const group = (label: string, what: 'quiz' | 'deck' | 'course'): JSX.Element => (
    <NavGroup onContextMenu={opens([what === 'quiz' ? newQuiz : what === 'deck' ? newDeck : newCourse])}>
      <span>{label}</span>
      <Button size="sm" variant="quiet" aria-label={`New ${what}`} title={`New ${what}`} onClick={() => setMaking(what)}>
        +
      </Button>
    </NavGroup>
  );
  return (
    <Surface>
      <Nav>
        <NavHead>
          <b>Academy</b>
        </NavHead>
        {entry('Get started', pageHref(host, 'start'), [go('Open', pageHref(host, 'start'))])}
        {decks.length > 0 && entry('Keep studying', pageHref(host, 'keep-studying'), [go('Open', pageHref(host, 'keep-studying')), go('Study across your decks', pageHref(host, 'study'))])}
        {(quizzes.length > 0 || decks.length > 0 || courses.length > 0) && entry('Everything', root, [go('Open', root), { ...newQuiz, rule: true }, newDeck, newCourse], quizzes.length + decks.length)}
        {data &&
          alias !== null &&
          courses.some((course) => course.created_by === alias) &&
          entry('Created by me', `${root}?show=mine`, [go('Open', `${root}?show=mine`), { ...newQuiz, rule: true }, newDeck, newCourse], [...quizzes, ...decks].filter((row) => isMine(row, data)).length)}
        {enrolled.length > 0 && entry('My courses', pageHref(host, 'my-courses'), [go('Open', pageHref(host, 'my-courses'))], enrolled.length)}
        {data && (
          <>
            {group('Courses', 'course')}
            {courses.map((course) => {
              const inCourse = quizzes.filter((row) => row.course === course.id);
              const decksIn = decks.filter((row) => row.course === course.id).length;
              return entry(
                course.title,
                pageHref(host, `course/${Q(course.id)}`),
                courseMenu(course),
                course.enrolled ? `${inCourse.filter((row) => row.best !== null).length}/${inCourse.length}` : inCourse.length + decksIn,
              );
            })}
            {group('Quizzes', 'quiz')}
            {quizzes.filter((row) => row.course === null).map((row) => entry(row.title, pageHref(host, `quiz/${Q(row.id)}`), quizMenu(row)))}
            {group('Decks', 'deck')}
            {decks.filter((row) => row.course === null).map((row) => entry(row.title, pageHref(host, `deck/${Q(row.id)}`), deckMenu(row)))}
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
}

function listRows(overview: Overview): ListRow[] {
  return [
    ...overview.quizzes.map((row) => ({
      kind: 'quiz' as const,
      ...row,
      size: row.questions,
      size_label: `${row.questions} ${row.questions === 1 ? 'question' : 'questions'}`,
      you: row.best ?? -1,
      you_label: row.best === null ? null : `Best ${asPercent(row.best)}`,
    })),
    ...overview.decks.map((row) => ({
      kind: 'deck' as const,
      ...row,
      size: row.cards,
      size_label: `${row.cards} ${row.cards === 1 ? 'card' : 'cards'}`,
      you: row.cards === 0 || row.learned + row.learning === 0 ? -1 : row.learned / row.cards,
      you_label: row.learned + row.learning === 0 ? null : `${row.learned} of ${row.cards} learned`,
    })),
  ];
}

// What the Quizzes plugin left, offered to the project's owners in one step.
function QuizzesLeft({ left, reload }: { left: NonNullable<Overview['quizzes_left']>; reload: () => void }): JSX.Element {
  const host = usePluginHost();
  const act = useAct();
  const [then, setThen] = useState<string[] | null>(null);
  if (then)
    return (
      <div style={{ marginBottom: 14 }}>
        <Notice>
          Everything from Quizzes is in Academy now, with every id and result kept.
          {then.length > 0 && (
            <>
              {' '}
              To finish, a framework editor runs:
              <pre className="qz-pre">{then.join('\n')}</pre>
            </>
          )}
        </Notice>
      </div>
    );
  return (
    <div style={{ marginBottom: 14 }}>
      <Notice>
        Quizzes, Academy's name before 0.3.0, left {left.quizzes} {left.quizzes === 1 ? 'quiz or course file' : 'quiz and course files'} and {left.results} result {left.results === 1 ? 'file' : 'files'} in this project.{' '}
        {left.may_move ? (
          <Button
            size="sm"
            onClick={async () => {
              if (!(await host.dialog.confirm('Move every quiz, course, result, and enrollment from Quizzes into Academy? Ids stay the same, so every result still names its quiz.', { title: 'Move into Academy', ok: 'Move' }))) return;
              await act('Could not move them', async () => {
                const moved = await host.post<{ then: string[] }>('move-quizzes');
                setThen(moved.then);
                reload();
              });
            }}
          >
            Move them into Academy
          </Button>
        ) : (
          "A project owner can move them into Academy."
        )}
      </Notice>
    </div>
  );
}

const PAGE_SIZES = [25, 50, 100, 250];

function QuizList({ show }: { show: string | null }): JSX.Element {
  const host = usePluginHost();
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
    const kept = listRows(data).filter((row) => {
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
  }, [data, search, course, creator, kind, sort, show]);

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
  const creators = [...new Map([...(data?.quizzes ?? []), ...(data?.decks ?? [])].flatMap((row) => (row.created_by ? [[row.created_by, row.created_by_name ?? row.created_by] as const] : []))).entries()];
  const open = (row: ListRow): void => host.navigate(pageHref(host, `${row.kind}/${Q(row.id)}`));
  const first = rows.length === 0 ? 0 : at * pageSize + 1;
  const last = Math.min(rows.length, (at + 1) * pageSize);
  return (
    <Surface>
      <Page>
        <PageHead>
          <Row justify="between" wrap style={{ width: '100%' }}>
            <Row gap="sm">
              <PageTitle>Academy</PageTitle>
              {data && <Text tone="faint">{rows.length}</Text>}
            </Row>
            <Row gap="sm">
              <Button onClick={() => setMaking('course')}>New course</Button>
              <Button onClick={() => setMaking('deck')}>New deck</Button>
              <Button variant="primary" onClick={() => setMaking('quiz')}>
                New quiz
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
                aria-label="Search quizzes and decks"
                placeholder="Search"
                value={search}
                onChange={(event: { target: HTMLInputElement }) => narrow(setSearch, event.target.value)}
                onKeyDown={(event: { key: string; currentTarget: HTMLInputElement }) => event.key === 'Escape' && event.currentTarget.blur()}
              />
              {search !== '' && (
                <button type="button" aria-label="Clear the search" onClick={() => narrow(setSearch, '')}>
                  ×
                </button>
              )}
            </span>
            <Button size="icon" aria-label="Refresh" title="Refresh" onClick={reload}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M13 3.5v3h-3M3 12.5v-3h3" />
                <path d="M12.6 6.5A5 5 0 0 0 3.6 5.2M3.4 9.5a5 5 0 0 0 9 1.3" />
              </svg>
            </Button>
          </div>
          <div className="qz-filters-row">
            <Select filter aria-label="Kind" value={kind} onChange={(event: { target: HTMLSelectElement }) => narrow(setKind, event.target.value)}>
              <option value="">Kind</option>
              <option value="quiz">Quizzes</option>
              <option value="deck">Decks</option>
            </Select>
            <Select filter aria-label="Course" value={course} onChange={(event: { target: HTMLSelectElement }) => narrow(setCourse, event.target.value)}>
              <option value="">Course</option>
              {(data?.courses ?? []).map((held) => (
                <option key={held.id} value={held.id}>
                  {held.title}
                </option>
              ))}
              <option value="oneoff">One-off</option>
            </Select>
            <Select filter aria-label="Created by" value={creator} onChange={(event: { target: HTMLSelectElement }) => narrow(setCreator, event.target.value)}>
              <option value="">Created by</option>
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
                Clear
              </Button>
            )}
          </div>
        </div>
        <div className="qz-dt-wrap" data-slot="table-wrap">
          <table className="qz-dt">
            <thead>
              <tr>
                {header('title', 'Title')}
                {header('course', 'Course')}
                <th>Draws from</th>
                {header('size', 'Size')}
                {header('created_by', 'Created by')}
                {header('you', 'You')}
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
                        <Badge>Deck</Badge>
                      </>
                    )}
                    {row.status === 'closed' && (
                      <>
                        {' '}
                        <Badge>Closed</Badge>
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
                      <Text tone="faint">One-off</Text>
                    )}
                  </td>
                  <td>{row.draws_from.join(', ') || <Text tone="faint">Nothing yet</Text>}</td>
                  <td>{row.size_label}</td>
                  <td>{row.created_by ? <UserPill alias={row.created_by} name={row.created_by_name} /> : <Text tone="faint">Unknown</Text>}</td>
                  <td>{row.you_label === null ? <Text tone="faint">Not yet</Text> : row.you_label}</td>
                </tr>
              ))}
              {data && rows.length === 0 && (
                <tr>
                  <td className="qz-dt-empty" colSpan={6}>
                    {data.quizzes.length + data.decks.length === 0 ? 'Nothing yet. New quiz or New deck starts one from your content.' : 'Nothing matches. Clear the search or the filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="qz-pager">
          <Select aria-label="Rows per page" value={String(pageSize)} onChange={(event: { target: HTMLSelectElement }) => narrow(setPageSize, Number(event.target.value))}>
            {PAGE_SIZES.map((size) => (
              <option key={size} value={String(size)}>
                {size} / page
              </option>
            ))}
          </Select>
          <span className="qz-pager-steps">
            <button type="button" aria-label="Previous page" disabled={at === 0} onClick={() => setPage(at - 1)}>
              ‹
            </button>
            <span>{rows.length === 0 ? 'No rows' : `${first}–${last} of ${rows.length}`}</span>
            <button type="button" aria-label="Next page" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
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
  const [link, setLink] = useState('');
  return (
    <Row gap="xs" wrap>
      {sources.map((source) => (
        <span className="qz-pill" key={source}>
          {source}
          <button aria-label={`Remove ${source}`} onClick={() => onChange(sources.filter((held) => held !== source))}>
            ×
          </button>
        </span>
      ))}
      <span className="qz-add">
        <Select aria-label="Add blueprint" value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && onChange([...sources, event.target.value])}>
          <option value="" hidden>
            Add blueprint…
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
        aria-label="Add a link or an asset path"
        placeholder="Add a link or an asset path"
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

export function NewQuiz({ onClose, courses, draws, course: startCourse }: { onClose: () => void; courses: Array<{ id: string; title: string }>; draws: string[]; course: string | null }): JSX.Element {
  const host = usePluginHost();
  const act = useAct();
  const { data: picks } = useData<Pickable>('pickable');
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState(startCourse ?? '');
  const [sources, setSources] = useState<string[]>(draws);
  const [start, setStart] = useState<'generate' | 'write'>('generate');
  const [count, setCount] = useState('20');
  const create = async (): Promise<void> => {
    await act('Could not create the quiz', async () => {
      const quiz = await host.post<Quiz>('quiz', { title, draws_from: sources, course: course || null });
      onClose();
      host.navigate(`${pageHref(host, `quiz/${Q(quiz.id)}/questions`)}${start === 'generate' ? `?generate=${Q(count)}` : ''}`);
    });
  };
  return (
    <Modal
      title="New quiz"
      onClose={onClose}
      foot={
        <Row justify="end" gap="sm">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={title.trim() === ''} onClick={create}>
            {start === 'generate' ? 'Create and generate' : 'Create quiz'}
          </Button>
        </Row>
      }
    >
      <Stack gap="md" pad="md">
        <label>
          <span className="qz-label">Title</span>
          <Input autoFocus value={title} onChange={(event: { target: HTMLInputElement }) => setTitle(event.target.value)} />
        </label>
        <div>
          <span className="qz-label">Course (optional)</span>
          <Select aria-label="Course" value={course} onChange={(event: { target: HTMLSelectElement }) => setCourse(event.target.value)}>
            <option value="">-</option>
            {courses.map((held) => (
              <option key={held.id} value={held.id}>
                {held.title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <span className="qz-label">Draws from</span>
          <DrawsFrom sources={sources} onChange={setSources} picks={picks} />
        </div>
        <div>
          <span className="qz-label">How to start</span>
          <Seg>
            <SegItem active={start === 'generate'} selected={start === 'generate'} onClick={() => setStart('generate')}>
              Generate with AI
            </SegItem>
            <SegItem active={start === 'write'} selected={start === 'write'} onClick={() => setStart('write')}>
              Write them myself
            </SegItem>
          </Seg>
        </div>
        {start === 'generate' && (
          <label>
            <span className="qz-label">Questions</span>
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
  courses: Array<{ id: string; title: string }>;
  quizzes: Array<{ id: string; title: string; questions: number }>;
  draws: string[];
  course: string | null;
  fromQuiz: string | null;
}): JSX.Element {
  const host = usePluginHost();
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
  const create = async (): Promise<void> => {
    await act('Could not create the deck', async () => {
      const made = await host.post<Deck>('deck', { title, draws_from: sources, course: course || null, from_quiz: start === 'quiz' ? quiz : null });
      onClose();
      host.navigate(start === 'quiz' ? pageHref(host, `deck/${Q(made.id)}`) : `${pageHref(host, `deck/${Q(made.id)}/cards`)}${start === 'generate' ? `?generate=${Q(count)}` : ''}`);
    });
  };
  return (
    <Modal
      title="New deck"
      onClose={onClose}
      foot={
        <Row justify="end" gap="sm">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={title.trim() === '' || (start === 'quiz' && !quiz)} onClick={create}>
            {start === 'generate' ? 'Create and generate' : 'Create deck'}
          </Button>
        </Row>
      }
    >
      <Stack gap="md" pad="md">
        <label>
          <span className="qz-label">Title</span>
          <Input autoFocus value={title} onChange={(event: { target: HTMLInputElement }) => setTitle(event.target.value)} />
        </label>
        <div>
          <span className="qz-label">Course (optional)</span>
          <Select aria-label="Course" value={course} onChange={(event: { target: HTMLSelectElement }) => setCourse(event.target.value)}>
            <option value="">-</option>
            {courses.map((held) => (
              <option key={held.id} value={held.id}>
                {held.title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <span className="qz-label">Draws from</span>
          <DrawsFrom sources={sources} onChange={setSources} picks={picks} />
        </div>
        <div>
          <span className="qz-label">How to start</span>
          <Seg>
            <SegItem active={start === 'generate'} selected={start === 'generate'} disabled={!hasAgent} onClick={() => setStart('generate')}>
              Generate with AI
            </SegItem>
            <SegItem active={start === 'quiz'} selected={start === 'quiz'} disabled={withQuestions.length === 0} onClick={() => setStart('quiz')}>
              From a quiz
            </SegItem>
            <SegItem active={start === 'write'} selected={start === 'write'} onClick={() => setStart('write')}>
              Write them myself
            </SegItem>
          </Seg>
        </div>
        {start === 'generate' && (
          <label>
            <span className="qz-label">Cards</span>
            <Input type="number" value={count} onChange={(event: { target: HTMLInputElement }) => setCount(event.target.value)} />
          </label>
        )}
        {start === 'quiz' && (
          <div>
            <span className="qz-label">The quiz its cards come from</span>
            <Select aria-label="Quiz" value={quiz} onChange={(event: { target: HTMLSelectElement }) => setQuiz(event.target.value)}>
              {withQuestions.map((held) => (
                <option key={held.id} value={held.id}>
                  {held.title} ({held.questions} questions)
                </option>
              ))}
            </Select>
            <Text tone="faint" size="sm" block>
              Each question becomes a card: the question on the front, its answer and why on the back.
            </Text>
          </div>
        )}
      </Stack>
    </Modal>
  );
}

function NewCourse({ onClose }: { onClose: () => void }): JSX.Element {
  const host = usePluginHost();
  const act = useAct();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const create = async (): Promise<void> => {
    await act('Could not create the course', async () => {
      const course = await host.post<Course>('course', { title, description });
      onClose();
      host.navigate(pageHref(host, `course/${Q(course.id)}`));
    });
  };
  return (
    <Modal
      title="New course"
      onClose={onClose}
      foot={
        <Row justify="end" gap="sm">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={title.trim() === ''} onClick={create}>
            Create course
          </Button>
        </Row>
      }
    >
      <Stack gap="md" pad="md">
        <label>
          <span className="qz-label">Title</span>
          <Input autoFocus value={title} onChange={(event: { target: HTMLInputElement }) => setTitle(event.target.value)} />
        </label>
        <label>
          <span className="qz-label">Description (optional)</span>
          <Textarea rows={3} value={description} onChange={(event: { target: HTMLTextAreaElement }) => setDescription(event.target.value)} />
        </label>
      </Stack>
    </Modal>
  );
}

// ---- Get started ---------------------------------------------------------------------------------

type StartScreen = 'what' | 'name' | 'content' | 'questions';
const START_SCREENS: Array<{ key: StartScreen; label: string }> = [
  { key: 'what', label: 'What to make' },
  { key: 'name', label: 'Name it' },
  { key: 'content', label: 'What it covers' },
  { key: 'questions', label: 'Its questions' },
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
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useTrail([{ label: 'Academy', href: pageHref(host, '') }, { label: 'Get started' }]);
  const firstField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (screen === 'name') firstField.current?.focus();
  }, [screen]);
  const at = START_SCREENS.findIndex((held) => held.key === screen);
  const named = title.trim() !== '' && (making !== 'course' || courseTitle.trim() !== '');
  const what = making === 'deck' ? 'deck' : 'quiz';
  const screens = START_SCREENS.map((held) => (held.key === 'questions' ? { ...held, label: making === 'deck' ? 'Its cards' : 'Its questions' } : held));
  const finish = async (): Promise<void> => {
    setBusy(true);
    setFailure(null);
    try {
      // a retry after the quiz failed does not make the course twice
      let course = making === 'course' ? madeCourse : null;
      if (making === 'course' && course === null) {
        course = (await host.post<Course>('course', { title: courseTitle, description })).id;
        setMadeCourse(course);
      }
      const made = making === 'deck' ? await host.post<Deck>('deck', { title, draws_from: sources, course: null }) : await host.post<Quiz>('quiz', { title, draws_from: sources, course });
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
            <h1 className="qz-start-title">Get started with Academy</h1>
            <p className="qz-muted" style={{ margin: 0 }}>
              A few choices make your first quiz or deck of flashcards. Every one can be changed afterward, and nothing is saved until the last step.
            </p>
          </header>
          <ol className="qz-steps" aria-label="Steps of getting started">
            {screens.map((held, index) => (
              <li key={held.key} data-state={index < at ? 'done' : index === at ? 'here' : 'ahead'} aria-current={index === at ? 'step' : undefined}>
                <button type="button" disabled={index >= at || busy} onClick={() => setScreen(held.key)}>
                  <span className="qz-step-mark">{index < at ? '✓' : index + 1}</span>
                  <span>{held.label}</span>
                </button>
              </li>
            ))}
          </ol>
          {failure && <Notice tone="error">{failure}</Notice>}
          {screen === 'what' && (
            <div className="qz-tiles" role="radiogroup" aria-label="What to make">
              <Tile checked={making === 'quiz'} name="A quiz" hint="One quiz on your content, standing on its own." onClick={() => setMaking('quiz')} />
              <Tile checked={making === 'deck'} name="A deck" hint="Flashcards on your content, studied a little at a time, whenever you like." onClick={() => setMaking('deck')} />
              <Tile checked={making === 'course'} name="A course" hint="Quizzes and decks in order. People enroll and follow their progress across them." onClick={() => setMaking('course')} />
            </div>
          )}
          {screen === 'name' && (
            <Stack gap="md">
              {making === 'course' && (
                <>
                  <label>
                    <span className="qz-label">The course's title</span>
                    <Input ref={firstField} value={courseTitle} onChange={(event: { target: HTMLInputElement }) => setCourseTitle(event.target.value)} />
                  </label>
                  <label>
                    <span className="qz-label">What it covers (optional)</span>
                    <Textarea rows={2} value={description} onChange={(event: { target: HTMLTextAreaElement }) => setDescription(event.target.value)} />
                  </label>
                </>
              )}
              <label>
                <span className="qz-label">{making === 'course' ? 'Its first quiz' : `The ${what}'s title`}</span>
                <Input {...(making !== 'course' ? { ref: firstField } : {})} value={title} onChange={(event: { target: HTMLInputElement }) => setTitle(event.target.value)} />
              </label>
            </Stack>
          )}
          {screen === 'content' && (
            <div>
              <span className="qz-label">Draws from: the blueprints, assets, and links its {making === 'deck' ? 'cards' : 'questions'} come from. You can add these later.</span>
              <DrawsFrom sources={sources} onChange={setSources} picks={picks} />
            </div>
          )}
          {screen === 'questions' && (
            <Stack gap="md">
              <div className="qz-tiles" role="radiogroup" aria-label={making === 'deck' ? 'Its cards' : 'Its questions'}>
                <Tile
                  checked={way === 'generate'}
                  name="Generate with AI"
                  hint={hasAgent ? `Your agent writes them from what the ${what} draws from.` : `Turn on the AI Agent plugin to generate ${making === 'deck' ? 'cards' : 'questions'}.`}
                  disabled={!hasAgent}
                  onClick={() => setWay('generate')}
                />
                <Tile
                  checked={way === 'write'}
                  name="Write them myself"
                  hint={making === 'deck' ? 'Add each card: its front, its back, and where it comes from.' : 'Add each question, its options, its answer, and why.'}
                  onClick={() => setWay('write')}
                />
              </div>
              {way === 'generate' && (
                <label>
                  <span className="qz-label">How many {making === 'deck' ? 'cards' : 'questions'}</span>
                  <Input type="number" value={count} onChange={(event: { target: HTMLInputElement }) => setCount(event.target.value)} />
                </label>
              )}
            </Stack>
          )}
          <Row gap="sm" wrap>
            {at > 0 && (
              <Button disabled={busy} onClick={() => setScreen(screens[at - 1]!.key)}>
                Back
              </Button>
            )}
            <span style={{ flex: 1 }} />
            {screen === 'questions' ? (
              <Button variant="primary" disabled={busy} onClick={finish}>
                {making === 'course' ? 'Create course' : making === 'deck' ? 'Create deck' : 'Create quiz'}
              </Button>
            ) : (
              <Button variant="primary" disabled={screen === 'name' && !named} onClick={() => setScreen(screens[at + 1]!.key)}>
                Continue
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
  useTrail([{ label: 'Academy', href: pageHref(host, '') }, { label: 'Get started' }]);
  const onCourse = course ? pageHref(host, `course/${Q(course)}`) : pageHref(host, '');
  const items = deck
    ? [
        { name: 'Keep studying', hint: 'Every deck you study, with how many cards you have learned and when you last studied it.', to: pageHref(host, 'keep-studying') },
        { name: 'Quizzes', hint: 'Check what people know, and make cards from a quiz you already have.', to: pageHref(host, '') },
        { name: 'Courses', hint: 'Quizzes and decks in order, which people enroll in to follow their progress.', to: onCourse },
      ]
    : [
        { name: 'Proctors', hint: "People who can edit the quiz and see everyone's results.", to: pageHref(host, `quiz/${Q(made)}`) },
        { name: course ? 'Your course' : 'Courses', hint: 'Quizzes and decks in order, which people enroll in to follow their progress.', to: onCourse },
        { name: 'Study plans', hint: '/study-plan in Chat has your agent write reading sessions.', to: onCourse },
      ];
  const write = deck ? pageHref(host, `deck/${Q(made)}/cards`) : pageHref(host, `quiz/${Q(made)}/questions`);
  return (
    <Surface>
      <Page>
        <div className="qz qz-start">
          <header>
            <h1 className="qz-start-title">{deck ? 'Your deck is ready for its cards' : 'Your quiz is ready for its questions'}</h1>
            <p className="qz-muted" style={{ margin: 0 }}>
              It opens to everyone as soon as it has {deck ? 'a card' : 'a question'}. There is more here when you need it.
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
              {generate ? `Generate your ${deck ? 'cards' : 'questions'}` : `Write your ${deck ? 'cards' : 'questions'}`}
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
  const { data, error } = useData<Overview>('overview');
  useTrail([{ label: 'Academy', href: pageHref(host, '') }, { label: 'My courses' }]);
  if (error) return <Failed message={error} />;
  if (!data) return <Loading />;
  const enrolled = data.courses.filter((course) => course.enrolled);
  return (
    <Surface>
      <Page>
        <div className="qz">
          <h1 className="qz-h1" style={{ marginBottom: 18 }}>
            My courses
          </h1>
          {enrolled.length === 0 && <Empty>You are not enrolled in a course. Open one and press Enroll to follow your progress across it.</Empty>}
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
                    {taken.length} of {quizzes.length} {quizzes.length === 1 ? 'quiz' : 'quizzes'} taken{average === null ? '' : `, average best ${asPercent(average)}`}
                  </span>
                  <div className="qz-progress" role="progressbar" aria-valuenow={taken.length} aria-valuemin={0} aria-valuemax={quizzes.length} aria-label={`Progress in ${course.title}`}>
                    <div style={{ width: `${(taken.length / Math.max(1, quizzes.length)) * 100}%` }} />
                  </div>
                </span>
                <Link className="qz-btn secondary" to={pageHref(host, `course/${Q(course.id)}/progress`)}>
                  See my scores
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
  return (
    <>
      {links.map((held) => (
        <span className="qz-pill" key={held}>
          {picks?.groups.includes(held) ? `${held}/*` : held}
          {editable && (
            <button aria-label={`Remove ${held}`} onClick={() => onChange(links.filter((link) => link !== held))}>
              ×
            </button>
          )}
        </span>
      ))}
      {links.length === 0 && !editable && <Text tone="faint">None</Text>}
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
          <span className="qz-muted qz-small">Enrolled {formatDate(data.enrolled_since)}</span>
        </div>
      )}
      <div className="qz-stats">
        <Stat hero label="Progress" value={`${progress.taken} of ${progress.of}`} sub="Quizzes taken officially" />
        <Stat label="Average best" value={asPercent(progress.average_best)} sub="Across quizzes taken" />
        <Stat
          label="Last taken"
          value={<span style={{ fontSize: 26 }}>{formatDate(progress.last_taken)}</span>}
          sub={data.mine ? `Enrolled ${formatDate(data.enrolled_since)}` : 'An official attempt'}
        />
        {data.sessions > 0 && <Stat label="Study plan" value={`${data.sessions_done} of ${data.sessions}`} sub="Sessions done" />}
      </div>
      <div className="qz-scroll">
        <table className="qz-table">
          <thead>
            <tr>
              <th>Quiz</th>
              <th className="num">Best</th>
              <th className="num">Latest</th>
              <th className="num">Attempts</th>
              <th>Last taken</th>
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
                        <span className="qz-badge">Closed</span>
                      </>
                    )}
                  </td>
                  <td className="num">{row.best === null ? <Text tone="faint">Not yet</Text> : asPercent(row.best)}</td>
                  <td className="num">{row.latest === null ? <Text tone="faint">-</Text> : asPercent(row.latest)}</td>
                  <td className="num">
                    {row.attempts === 0 ? (
                      <Text tone="faint">0</Text>
                    ) : (
                      <button
                        className="qz-toggle"
                        aria-expanded={showing}
                        aria-label={`${row.attempts} ${row.attempts === 1 ? 'attempt' : 'attempts'} on ${row.title}`}
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
                              <button onClick={() => setReviewing({ quiz: row.id, attempt: attempt.id })}>Review answers</button>
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
                  <Text tone="muted">This course has no quizzes yet.</Text>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="qz-muted qz-small" style={{ marginTop: 8 }}>
        Official attempts only. Practice stays on each person's machine and never counts here.
      </p>
      {reviewing && (
        <AttemptModal quiz={reviewing.quiz} attempt={reviewing.attempt} title={data.mine ? 'Review' : data.person.name} {...(data.mine ? {} : { chose: 'Chose' })} onClose={() => setReviewing(null)} />
      )}
    </>
  );
}

// Everyone enrolled in a course, each opening their ProgressDetail.
function EnrolledTab({ course }: { course: string }): JSX.Element {
  const host = usePluginHost();
  const { data, error } = useData<RosterView>(`course/people?id=${Q(course)}`);
  const [search, setSearch] = useState('');
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Loading />;
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const people = data.people.filter((person) => words.every((word) => `${person.name} ${person.alias}`.toLowerCase().includes(word)));
  return (
    <>
      <div className="qz-stats">
        <Stat hero label="Enrolled" value={data.people.length} sub={data.people.length === 1 ? 'Person in this course' : 'People in this course'} />
        <Stat label="Average best" value={asPercent(data.average_best)} sub="Across people who have taken a quiz" />
      </div>
      <Input aria-label="Search people" placeholder="Search people" value={search} onChange={(event: { target: HTMLInputElement }) => setSearch(event.target.value)} />
      <div className="qz-scroll" style={{ marginTop: 10 }}>
        <table className="qz-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Progress</th>
              <th className="num">Average best</th>
              <th>Last taken</th>
              <th>Enrolled</th>
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
                  {person.taken} of {person.of}
                  <div className="qz-progress qz-minibar" role="progressbar" aria-valuenow={person.taken} aria-valuemin={0} aria-valuemax={person.of} aria-label={`${person.name}'s progress`}>
                    <div style={{ width: `${(person.taken / Math.max(1, person.of)) * 100}%` }} />
                  </div>
                </td>
                <td className="num">{person.average_best === null ? <Text tone="faint">Not yet</Text> : asPercent(person.average_best)}</td>
                <td>{person.last_taken ? formatDate(person.last_taken) : <Text tone="faint">-</Text>}</td>
                <td>{formatDate(person.since)}</td>
              </tr>
            ))}
            {people.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Text tone="muted">{data.people.length === 0 ? 'Nobody has enrolled yet. People show here as they do.' : 'Nobody matches the search.'}</Text>
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
        <button type="button" className="qz-inline" aria-label={`${props.label}: ${value || 'none'}. Press to edit`} onClick={() => setDraft(value)}>
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
  const act = useAct();
  const { data, error, reload } = useData<CourseView>(`course?id=${Q(id)}`);
  const { data: picks } = useData<Pickable>('pickable');
  const { data: overview } = useData<Overview>('overview');
  const [adding, setAdding] = useState<'quiz' | 'deck' | null>(null);
  useTrail(
    data
      ? [
          { label: 'Academy', href: pageHref(host, '') },
          ...(person ? [{ label: data.course.title, href: pageHref(host, `course/${Q(id)}/people`) }, { label: `@${person}` }] : [{ label: data.course.title }]),
        ]
      : null,
  );
  if (error) return <Failed message={error} />;
  if (!data) return <Loading />;
  const { course, quizzes, decks, items, progress } = data;
  const patch = (body: Record<string, unknown>): void => {
    void act('Could not change the course', async () => {
      await host.put(`course?id=${Q(id)}`, body);
      reload();
    });
  };
  const move = (from: number, to: number): void => {
    const ids = items.map((placed) => placed.row.id);
    const [held] = ids.splice(from, 1);
    ids.splice(to, 0, held!);
    void act('Could not reorder the course', async () => {
      await host.put(`course/order?id=${Q(id)}`, { ids });
      reload();
    });
  };
  const enroll = (): void => {
    void act('Could not enroll', async () => {
      await host.post(`course/enroll?id=${Q(id)}`);
      reload();
    });
  };
  const leave = async (): Promise<void> => {
    if (!(await host.dialog.confirm(`Leave ${course.title}? Your results stay, and enrolling again brings your progress back.`, { title: 'Leave course', ok: 'Leave' }))) return;
    await act('Could not leave the course', async () => {
      await host.del(`course/enroll?id=${Q(id)}`);
      host.navigate(pageHref(host, `course/${Q(id)}`));
      reload();
    });
  };
  const enrolled = data.enrolled_since !== null;
  const tabs: Array<{ name: string; label: string; show: boolean }> = [
    { name: '', label: decks.length > 0 ? 'Quizzes and decks' : 'Quizzes', show: true },
    { name: 'progress', label: 'My progress', show: enrolled },
    { name: 'people', label: `Enrolled (${data.enrolled_people})`, show: data.may.people },
  ];
  const active = tabs.find((held) => held.name === tab && held.show)?.name ?? '';
  const remove = async (): Promise<void> => {
    if (!(await host.dialog.confirm(`Delete ${course.title}? Its ${quizzes.length} quizzes and ${decks.length} decks stay, as one-offs.`, { title: 'Delete course', ok: 'Delete', danger: true }))) return;
    await act('Could not delete the course', async () => {
      await host.del(`course?id=${Q(id)}`);
      host.navigate(pageHref(host, ''));
    });
  };
  return (
    <Surface>
      <Page>
        <div className="qz">
          <span className="qz-eyebrow">Course</span>
          <div className="qz-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 400px', minWidth: 0 }}>
              <InlineText className="qz-h1" as="h1" label="The course's name" value={course.title} editable={data.may.edit} onSave={(title) => title.trim() !== '' && patch({ title })} />
            </div>
            <span className="qz-head-actions">
              {enrolled && <span className="qz-badge good">Enrolled</span>}
              {enrolled && (
                <Button size="sm" variant="quiet" onClick={leave}>
                  Leave course
                </Button>
              )}
              {data.may.edit && (
                <>
                  <button className="qz-btn secondary" onClick={() => setAdding('quiz')}>
                    Add quiz
                  </button>
                  <button className="qz-btn secondary" onClick={() => setAdding('deck')}>
                    Add deck
                  </button>
                  <Button size="sm" variant="quiet" onClick={remove}>
                    Delete
                  </Button>
                </>
              )}
            </span>
          </div>
          <InlineText
            className="qz-course-description qz-muted"
            as="p"
            multiline
            label="The course's description"
            placeholder="Add a description"
            value={course.description}
            editable={data.may.edit}
            onSave={(description) => patch({ description })}
          />
          <dl className="qz-props">
            <dt>Content</dt>
            <dd>
              <LinkPills links={course.content} editable={data.may.edit} label="Add content…" picks={picks} onChange={(content) => patch({ content })} />
            </dd>
            <dt>Study plan</dt>
            <dd>
              <LinkPills links={course.study_plan} editable={data.may.edit} label="Add study plan…" picks={picks} onChange={(study_plan) => patch({ study_plan })} />
              {course.study_plan.length === 0 && data.may.edit && (
                <Ask
                  label="Build a study plan"
                  title={`Study plan: ${course.title}`}
                  text={studyPlanText(`the course ${course.id}, "${course.title}" (its content: ${course.content.join(', ') || 'ask me'})`)}
                />
              )}
            </dd>
            <dt>Created by</dt>
            <dd>
              {course.created_by ? <UserPill alias={course.created_by} name={data.created_by_name} /> : <Text tone="faint">Unknown</Text>}
              {data.may.edit && (
                <span className="qz-add">
                  <Select aria-label="Change who created it" value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && patch({ created_by: event.target.value })}>
                    <option value="" hidden>
                      {course.created_by ? 'Change…' : 'Set creator…'}
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
                    ← Everyone enrolled
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
                    label="Your progress"
                    value={`${progress.taken} of ${progress.of}`}
                    sub={
                      <Link className="qz-link" to={pageHref(host, `course/${Q(id)}/progress`)}>
                        See your scores
                      </Link>
                    }
                  />
                  <Stat label="Your average best" value={asPercent(progress.average_best)} sub="Across quizzes taken" />
                  {progress.sessions > 0 && <Stat label="Study plan" value={`${progress.sessions_done} of ${progress.sessions}`} sub="Sessions done" />}
                </div>
              ) : (
                <div className="qz-card qz-enroll">
                  <div className="qz-row">
                    <strong>Track your progress</strong>
                    <button className="qz-btn" disabled={!data.may.enroll} title={data.may.enroll_why ?? undefined} onClick={enroll}>
                      Enroll
                    </button>
                  </div>
                  <div className="qz-muted qz-small" style={{ marginTop: 4 }}>
                    Follow your scores across every quiz in this course{progress.taken > 0 ? `, starting with the ${progress.taken === 1 ? 'one' : progress.taken} you have taken` : ''}. You can take
                    any quiz without enrolling. Enrolling shows your scores in this course to its creator, its quizzes' creators and proctors, and the project's owners.
                  </div>
                </div>
              )}
              {decks.length > 0 && (
                <div className="qz-stats">
                  <Stat label="Cards learned" value={`${progress.cards_learned} of ${progress.cards}`} sub={`Across ${decks.length} ${decks.length === 1 ? 'deck' : 'decks'}`} />
                  <Stat
                    label="Still learning"
                    value={progress.cards_learning}
                    sub={
                      <Link className="qz-link" to={`${pageHref(host, 'study')}?course=${Q(id)}`}>
                        Study the course's cards
                      </Link>
                    }
                  />
                </div>
              )}
              <h2 className="qz-h2">{decks.length > 0 ? 'The course, in order' : 'Quizzes, in order'}</h2>
              {items.length === 0 && <Empty>Nothing in this course yet. Add quiz or Add deck starts it.</Empty>}
              {items.map((placed, index) => {
                const { row } = placed;
                const page = pageHref(host, `${placed.kind}/${Q(row.id)}`);
                return (
                  <div className="qz-card qz-quiz" key={row.id}>
                    {data.may.edit && (
                      <span className="qz-move">
                        <button aria-label={`Move ${row.title} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>
                          ▲
                        </button>
                        <button aria-label={`Move ${row.title} down`} disabled={index === items.length - 1} onClick={() => move(index, index + 1)}>
                          ▼
                        </button>
                      </span>
                    )}
                    <span className="qz-badge accent">{index + 1}</span>
                    {decks.length > 0 && <span className={`qz-badge${placed.kind === 'deck' ? ' good' : ''}`}>{placed.kind === 'deck' ? 'Deck' : 'Quiz'}</span>}
                    <span style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <Link to={page} style={{ display: 'block', fontWeight: 600 }}>
                        {row.title}
                      </Link>
                      <span className="qz-muted qz-small">
                        {placed.kind === 'quiz' ? `${placed.row.questions} ${placed.row.questions === 1 ? 'question' : 'questions'}` : `${placed.row.cards} ${placed.row.cards === 1 ? 'card' : 'cards'}`}
                        {row.draws_from.length > 0 ? `, draws from ${row.draws_from.join(' and ')}` : ''}
                      </span>
                    </span>
                    {placed.kind === 'quiz' ? (
                      <>
                        <span className="qz-badge">{placed.row.best === null ? 'Not yet' : `Best ${asPercent(placed.row.best)}`}</span>
                        {row.status === 'closed' ? (
                          <span className="qz-badge">Closed</span>
                        ) : (
                          <Link className={`qz-btn${placed.row.best === null ? '' : ' secondary'}`} to={page}>
                            {placed.row.best === null ? 'Take' : 'Retake'}
                          </Link>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="qz-badge">{placed.row.learned + placed.row.learning === 0 ? 'Not yet' : `${placed.row.learned} of ${placed.row.cards} learned`}</span>
                        {row.status === 'closed' ? (
                          <span className="qz-badge">Closed</span>
                        ) : (
                          <Link className="qz-btn" to={`${pageHref(host, 'study')}?deck=${Q(row.id)}`}>
                            Study
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              <p className="qz-muted qz-small">The order suggests a path. Anyone can open any of them at any time.</p>
              {data.sessions.length > 0 && (
                <>
                  <h2 className="qz-h2">Study plan</h2>
                  {data.sessions.map((session) => (
                    <div className="qz-row" key={session.id} style={{ padding: '6px 0' }}>
                      <a className="qz-link" href={host.hrefs.blueprint(session.rel)}>
                        {session.title}
                      </a>
                      <span className="qz-badge">{session.done ? 'Done' : 'Not yet'}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </Page>
      {adding === 'quiz' && <NewQuiz onClose={() => setAdding(null)} courses={overview?.courses ?? [{ id: course.id, title: course.title }]} draws={[]} course={course.id} />}
      {adding === 'deck' && (
        <NewDeck onClose={() => setAdding(null)} courses={overview?.courses ?? [{ id: course.id, title: course.title }]} quizzes={overview?.quizzes ?? []} draws={[]} course={course.id} fromQuiz={null} />
      )}
    </Surface>
  );
}

// ---- a quiz and its tabs -------------------------------------------------------------------------------

function Chart({ points }: { points: MyScores['over_time'] }): JSX.Element {
  const [width, top, bottom] = [800, 20, 170];
  const x = (index: number): number => (points.length === 1 ? 420 : 80 + (index * (width - 120)) / (points.length - 1));
  const y = (fraction: number): number => bottom - fraction * (bottom - top);
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(point.percent)}`).join('');
  const labels = points.filter((_, index) => points.length <= 8 || index % Math.ceil(points.length / 8) === 0 || index === points.length - 1);
  return (
    <div className="qz-card">
      <svg viewBox={`0 0 ${width} 210`} width="100%" role="img" aria-label={`Official scores over time: ${points.map((point) => asPercent(point.percent)).join(', ')}`}>
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

function Review({ attempt, chose = 'You chose' }: { attempt: Attempt; chose?: string }): JSX.Element {
  return (
    <>
      {attempt.answers.map((answer) => {
        const right = answer.chosen === answer.question.answer;
        return (
          <div className="qz-review" key={answer.question.id}>
            <span className={right ? 'qz-yes' : 'qz-no'}>{right ? '✓' : '✗'}</span> {answer.question.prompt}
            {!right && (
              <div className="qz-small">
                {chose}: {answer.question.options[answer.chosen]}
              </div>
            )}
            <div className="qz-muted qz-small">Answer: {answer.question.options[answer.question.answer]}</div>
            {answer.question.why && <div className="qz-muted qz-small">{answer.question.why}</div>}
          </div>
        );
      })}
    </>
  );
}

function AttemptModal({ quiz, attempt, title, chose, onClose }: { quiz: string; attempt: string; title: string; chose?: string; onClose: () => void }): JSX.Element {
  const { data, error } = useData<Attempt>(`attempt?id=${Q(quiz)}&attempt=${Q(attempt)}`);
  return (
    <Modal title={title} size="lg" onClose={onClose}>
      <div className="qz" style={{ padding: 0 }}>
        {error && <Notice tone="error">{error}</Notice>}
        {data && (
          <>
            <div className="qz-stats">
              <Stat hero label="Score" value={asPercent(data.score / data.total)} sub={`${data.score} of ${data.total} correct`} />
              <Stat label="When" value={<span style={{ fontSize: 26 }}>{formatDate(data.completed_at)}</span>} sub={data.kind === 'official' ? 'Official attempt' : 'Practice, local'} />
            </div>
            <Review attempt={data} {...(chose ? { chose } : {})} />
          </>
        )}
      </div>
    </Modal>
  );
}

const modeWords: Record<AttemptMode, string> = { whole: 'whole quiz', missed: 'missed questions', unseen: 'unseen questions' };

function MyScoresTab({ view }: { view: QuizView }): JSX.Element {
  const host = usePluginHost();
  const { scores, practice, quiz, askable } = view;
  const [reviewing, setReviewing] = useState<string | null>(null);
  const take = (kind: AttemptKind, mode: AttemptMode): string => `${pageHref(host, `take/${Q(quiz.id)}`)}?kind=${kind}&mode=${mode}`;
  return (
    <>
      {scores.official_attempts > 0 && (
        <div className="qz-stats">
          <Stat hero label="Best official" value={asPercent(scores.best?.percent)} sub={`${scores.best?.score} of ${scores.best?.total}, ${formatDate(scores.best?.completed_at)}`} />
          <Stat
            label="Latest official"
            value={asPercent(scores.latest?.percent)}
            sub={scores.latest?.change === null ? 'Your first official attempt' : <Delta change={scores.latest?.change} suffix="vs your last try" />}
          />
          <Stat label="Official attempts" value={scores.official_attempts} sub={`Since ${formatDate(scores.first_official)}`} />
        </div>
      )}
      {askable === 0 ? (
        <Empty>This quiz has no questions yet.</Empty>
      ) : quiz.status === 'closed' && !view.may.edit ? (
        <Empty>This quiz is closed. You can take it once it opens.</Empty>
      ) : (
        <div className="qz-grid">
          <div className="qz-card">
            <div className="qz-row">
              <strong>Official attempt</strong>
              <span className="qz-badge accent">Shared</span>
            </div>
            <div className="qz-muted qz-small" style={{ marginTop: 4 }}>
              The whole quiz. Your score is committed and kept in your history.
            </div>
            <div className="qz-actions">
              {view.may.take_official && quiz.status === 'open' ? (
                <Link className="qz-btn" to={take('official', 'whole')}>
                  Take officially
                </Link>
              ) : (
                <button className="qz-btn" disabled title={quiz.status === 'closed' ? 'Open this quiz to take it officially' : (view.may.official_why ?? undefined)}>
                  Take officially
                </button>
              )}
            </div>
          </div>
          <div className="qz-card">
            <div className="qz-row">
              <strong>Practice</strong>
              <span className="qz-badge">
                <LaptopMark /> Local
              </span>
            </div>
            <div className="qz-muted qz-small" style={{ marginTop: 4 }}>
              {quiz.status === 'closed' ? 'Try it out while it is closed. Stays on this machine.' : 'Stays on this machine. Never committed, never counted.'}
            </div>
            <div className="qz-actions">
              <Link className="qz-btn secondary" to={take('practice', 'whole')}>
                Whole quiz
              </Link>
              {practice.missed.length > 0 ? (
                <Link className="qz-btn secondary" to={take('practice', 'missed')}>
                  Retry missed ({practice.missed.length})
                </Link>
              ) : (
                <button className="qz-btn secondary" disabled>
                  Retry missed (0)
                </button>
              )}
              {practice.unseen.length > 0 ? (
                <Link className="qz-btn secondary" to={take('practice', 'unseen')}>
                  Not yet seen ({practice.unseen.length})
                </Link>
              ) : (
                <button className="qz-btn secondary" disabled>
                  Not yet seen (0)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {scores.over_time.length > 0 && (
        <>
          <h2 className="qz-h2">Scores over time</h2>
          <Chart points={scores.over_time} />
        </>
      )}
      <h2 className="qz-h2">History</h2>
      <div className="qz-scroll">
        <table className="qz-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Quiz</th>
              <th className="num">Score</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {scores.history.map((attempt) => (
              <tr key={attempt.id}>
                <td>{formatDate(attempt.completed_at)}</td>
                <td>
                  {attempt.kind === 'official' ? (
                    'Official'
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <LaptopMark /> Practice, {modeWords[attempt.mode]}
                    </span>
                  )}
                </td>
                <td className="num">
                  {attempt.score}/{attempt.total} ({asPercent(attempt.percent)})
                </td>
                <td className="num">
                  <button className="qz-rowlink qz-small" style={{ color: 'var(--color-accent)' }} onClick={() => setReviewing(attempt.id)}>
                    Review
                  </button>
                </td>
              </tr>
            ))}
            {scores.history.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <Text tone="muted">No attempts yet. Take the quiz, or practice first.</Text>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {reviewing && <AttemptModal quiz={quiz.id} attempt={reviewing} title="Review" onClose={() => setReviewing(null)} />}
    </>
  );
}

function CompareTab({ id }: { id: string }): JSX.Element {
  const { data, error } = useData<Comparison>(`compare?id=${Q(id)}`);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Loading />;
  if (data.people === 0) return <Empty>Nobody has taken this quiz officially yet. Totals show here once someone has.</Empty>;
  const most = Math.max(1, ...data.bands.map((band) => band.count));
  return (
    <>
      <div className="qz-stats">
        <Stat
          hero
          label="Your latest"
          value={asPercent(data.mine)}
          sub={data.mine === null ? 'Not taken officially yet' : <Delta change={data.mine - (data.average ?? 0)} suffix="vs the quiz average" />}
        />
        <Stat label="Quiz average" value={asPercent(data.average)} sub="Latest official attempts" />
        <Stat label="People" value={data.people} sub="Took it officially" />
      </div>
      <h2 className="qz-h2">Where you sit</h2>
      <div className="qz-card">
        <div className="qz-bars" role="img" aria-label={data.bands.map((band) => `${band.label}: ${band.count}${band.mine ? ', you' : ''}`).join('; ')}>
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
              {band.label}
              {band.mine ? ', you' : ''}
            </span>
          ))}
        </div>
      </div>
      <p className="qz-muted qz-small" style={{ marginTop: 10 }}>
        Totals only. Other people's names, scores, and answers stay with the quiz's creator and proctors.
      </p>
    </>
  );
}

function ResultsTab({ view }: { view: QuizView }): JSX.Element {
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
        <Stat hero label="Quiz average" value={asPercent(data.summary.average)} sub="Latest official attempts" />
        <Stat label="People" value={data.summary.people} sub="Took it officially" />
        <Stat label="Official attempts" value={data.attempts} sub={data.first ? `Since ${formatDate(data.first)}` : 'None yet'} />
      </div>
      <Input aria-label="Search people" placeholder="Search people" value={search} onChange={(event: { target: HTMLInputElement }) => setSearch(event.target.value)} />
      <div className="qz-scroll" style={{ marginTop: 10 }}>
        <table className="qz-table">
          <thead>
            <tr>
              <th>Person</th>
              <th className="num">Attempts</th>
              <th className="num">Latest</th>
              <th className="num">Best</th>
              <th>Last taken</th>
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
                  <Text tone="muted">{data.people.length === 0 ? 'Nobody has taken this quiz officially yet. Results show here as people do.' : 'Nobody matches the search.'}</Text>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="qz-muted qz-small" style={{ marginTop: 8 }}>
        Practice attempts are local and never appear here.
      </p>
      {open && (
        <Modal title={open.name} size="lg" onClose={() => setOpen(null)}>
          {open.history.length > 1 && (
            <Select aria-label="Attempt" value={open.attempt} onChange={(event: { target: HTMLSelectElement }) => setOpen({ ...open, attempt: event.target.value })}>
              {open.history.map((attempt) => (
                <option key={attempt.id} value={attempt.id}>
                  {formatDate(attempt.completed_at)}, {asPercent(attempt.percent)}
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

function PersonAttempt({ quiz, attempt }: { quiz: string; attempt: string }): JSX.Element {
  const { data, error } = useData<Attempt>(`attempt?id=${Q(quiz)}&attempt=${Q(attempt)}`);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Text tone="muted">Loading</Text>;
  return (
    <div className="qz" style={{ padding: '10px 0 0' }}>
      <div className="qz-stats">
        <Stat hero label="Score" value={asPercent(data.score / data.total)} sub={`${data.score} of ${data.total} correct`} />
        <Stat label="Missed" value={data.total - data.score} sub={`Questions as asked on ${formatDate(data.completed_at)}`} />
      </div>
      <Review attempt={data} chose="Chose" />
    </div>
  );
}

// ---- the builder -------------------------------------------------------------------------------------------

function Builder({ view, generate, reload }: { view: QuizView; generate: string | null; reload: () => void }): JSX.Element {
  const host = usePluginHost();
  const act = useAct();
  const { quiz } = view;
  const alias = host.user?.alias ?? null;
  const [mode, setMode] = useState<'builder' | 'source'>('builder');
  const [picked, setPicked] = useState<string | null>(quiz.questions[0]?.id ?? null);
  const [draft, setDraft] = useState<Question | null>(null);
  const [count, setCount] = useState(generate ?? '20');
  const held = quiz.questions.find((question) => question.id === picked) ?? null;
  const editing = draft ?? held;

  const dirty = draft !== null;
  const change = (patch: Partial<Question>): void => setDraft({ ...(editing as Question), ...patch });
  const save = async (): Promise<void> => {
    if (!draft) return;
    const ok = await act('Could not save the question', () => host.put(`question?id=${Q(quiz.id)}`, { question: draft }));
    if (ok) {
      setPicked(draft.id);
      setDraft(null);
      reload();
    }
  };
  const add = async (): Promise<void> => {
    await act('Could not add a question', async () => {
      const blank = await host.post<Question>(`question/blank?id=${Q(quiz.id)}`);
      setPicked(blank.id);
      setDraft(blank);
    });
  };
  const remove = async (): Promise<void> => {
    if (!held) {
      setDraft(null);
      setPicked(quiz.questions[0]?.id ?? null);
      return;
    }
    if (!(await host.dialog.confirm('Delete this question? Past attempts keep their copy of it.', { title: 'Delete question', ok: 'Delete', danger: true }))) return;
    await act('Could not delete the question', async () => {
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
    void act('Could not reorder the questions', async () => {
      await host.put(`questions/order?id=${Q(quiz.id)}`, { ids });
      reload();
    });
  };
  const rows = draft && !held ? [...quiz.questions, draft] : quiz.questions;
  return (
    <>
      <Row justify="between" wrap gap="sm">
        <Seg>
          <SegItem active={mode === 'builder'} selected={mode === 'builder'} onClick={() => setMode('builder')}>
            Builder
          </SegItem>
          <SegItem active={mode === 'source'} selected={mode === 'source'} onClick={() => setMode('source')}>
            Source
          </SegItem>
        </Seg>
        <Row gap="sm" wrap>
          <span style={{ width: 70 }}>
            <Input aria-label="How many questions to generate" type="number" value={count} onChange={(event: { target: HTMLInputElement }) => setCount(event.target.value)} />
          </span>
          <Ask label="Generate questions" title={`Questions: ${quiz.title}`} text={generateText(quiz, Number(count) || 20, alias)} />
          <Button size="sm" onClick={add}>
            Add question
          </Button>
        </Row>
      </Row>
      {generate && quiz.questions.length === 0 && (
        <div style={{ marginTop: 12 }}>
          <Notice>Press Generate questions to have your agent write them in Chat. They appear here as it adds them, and your agent opens the quiz once the last one is in.</Notice>
        </div>
      )}
      {mode === 'source' ? (
        <SourceEditor id={quiz.id} reload={reload} />
      ) : (
        <div className="qz-builder" style={{ marginTop: 14 }}>
          <div className="qz-qlist">
            {rows.map((question, index) => (
              <button
                key={question.id}
                className="qz-qrow"
                aria-current={question.id === picked ? 'true' : undefined}
                onClick={() => {
                  setPicked(question.id);
                  setDraft(null);
                }}
              >
                <span className="qz-muted">{index + 1}</span>
                <span>{question.prompt || 'New question'}</span>
              </button>
            ))}
            {rows.length === 0 && (
              <div style={{ padding: 10 }}>
                <Text tone="muted" size="sm">
                  No questions yet. Generate them, or add the first by hand.
                </Text>
              </div>
            )}
          </div>
          {editing && (
            <div className="qz-qform">
              <div>
                <Row justify="between" wrap gap="sm">
                  <label className="qz-label" htmlFor="qz-prompt" style={{ margin: 0 }}>
                    Question
                  </label>
                  <Row gap="xs" wrap>
                    {held && <Ask label="Regenerate question" title={`Regenerate: ${held.prompt.slice(0, 40)}`} text={regenerateText(quiz, held)} />}
                    {held && (
                      <>
                        <Button size="sm" variant="quiet" disabled={quiz.questions[0]?.id === held.id} aria-label="Move question up" onClick={() => nudge(held.id, -1)}>
                          ▲
                        </Button>
                        <Button size="sm" variant="quiet" disabled={quiz.questions.at(-1)?.id === held.id} aria-label="Move question down" onClick={() => nudge(held.id, 1)}>
                          ▼
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="quiet" aria-label="Delete question" onClick={remove}>
                      Delete
                    </Button>
                  </Row>
                </Row>
                <div style={{ marginTop: 4 }}>
                  <Textarea id="qz-prompt" rows={2} value={editing.prompt} onChange={(event: { target: HTMLTextAreaElement }) => change({ prompt: event.target.value })} />
                </div>
              </div>
              <div role="radiogroup" aria-label="The answer">
                <span className="qz-label">Options: pick the one that is the answer</span>
                {editing.options.map((option, index) => (
                  <div className="qz-key" key={index}>
                    <input type="radio" name="qz-answer" aria-label={`Option ${index + 1} is the answer`} checked={editing.answer === index} onChange={() => change({ answer: index })} />
                    <Input
                      aria-label={`Option ${index + 1}`}
                      value={option}
                      onChange={(event: { target: HTMLInputElement }) => change({ options: editing.options.map((held2, at) => (at === index ? event.target.value : held2)) })}
                    />
                    <Button
                      size="sm"
                      variant="quiet"
                      aria-label={`Remove option ${index + 1}`}
                      disabled={editing.options.length <= 2}
                      onClick={() =>
                        change({
                          options: editing.options.filter((_, at) => at !== index),
                          answer: editing.answer === null ? null : editing.answer === index ? null : editing.answer > index ? editing.answer - 1 : editing.answer,
                        })
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <Button size="sm" disabled={editing.options.length >= 5} onClick={() => change({ options: [...editing.options, ''] })}>
                  Add option
                </Button>
              </div>
              <label>
                <span className="qz-label">Why this is the answer</span>
                <Textarea rows={3} value={editing.why} onChange={(event: { target: HTMLTextAreaElement }) => change({ why: event.target.value })} />
              </label>
              <label>
                <span className="qz-label">Reference</span>
                <Input value={editing.reference} onChange={(event: { target: HTMLInputElement }) => change({ reference: event.target.value })} />
              </label>
              <Row justify="end" gap="sm">
                <Button disabled={!dirty} onClick={() => (held ? setDraft(null) : void remove())}>
                  Discard
                </Button>
                <Button variant="primary" disabled={!dirty} onClick={save}>
                  Save
                </Button>
              </Row>
              <Text tone="faint" size="sm" block>
                Past attempts keep each question as it was asked. A regenerated question counts as not yet seen.
              </Text>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function SourceEditor({ id, reload, route = 'source', what = 'quiz' }: { id: string; reload: () => void; route?: string; what?: string }): JSX.Element {
  const host = usePluginHost();
  const act = useAct();
  const { data } = useData<{ text: string }>(`${route}?id=${Q(id)}`);
  const [text, setText] = useState<string | null>(null);
  const value = text ?? data?.text ?? '';
  return (
    <div style={{ marginTop: 14 }}>
      <Textarea
        aria-label={`The ${what}'s file`}
        rows={24}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
        value={value}
        onChange={(event: { target: HTMLTextAreaElement }) => setText(event.target.value)}
      />
      <div style={{ marginTop: 8 }}>
        <Row justify="end" gap="sm">
          <Button disabled={text === null} onClick={() => setText(null)}>
            Discard
          </Button>
          <Button
            variant="primary"
            disabled={text === null}
            onClick={async () => {
              const ok = await act('Could not save the file', () => host.put(`${route}?id=${Q(id)}`, { text: value }));
              if (ok) {
                setText(null);
                reload();
              }
            }}
          >
            Save
          </Button>
        </Row>
      </div>
    </div>
  );
}

// ---- the quiz page -------------------------------------------------------------------------------------------

function QuizPage({ id, tab, generate }: { id: string; tab: string; generate: string | null }): JSX.Element {
  const host = usePluginHost();
  const act = useAct();
  const { data, error, reload } = useData<QuizView>(`quiz?id=${Q(id)}`);
  const { data: picks } = useData<Pickable>('pickable');
  const { data: overview } = useData<Overview>('overview');
  const [makingDeck, setMakingDeck] = useState(false);
  useTrail(
    data
      ? [
          { label: 'Academy', href: pageHref(host, '') },
          ...(data.course ? [{ label: data.course.title, href: pageHref(host, `course/${Q(data.course.id)}`) }] : []),
          { label: data.quiz.id, mono: true },
        ]
      : null,
  );
  if (error) return <Failed message={error} />;
  if (!data) return <Loading />;
  const { quiz, may } = data;
  const patch = (body: Record<string, unknown>): void => {
    void act('Could not change the quiz', async () => {
      await host.put(`quiz?id=${Q(id)}`, body);
      reload();
    });
  };
  const remove = async (): Promise<void> => {
    if (!(await host.dialog.confirm(`Delete ${quiz.title}? The results people already have stay in their history.`, { title: 'Delete quiz', ok: 'Delete', danger: true }))) return;
    await act('Could not delete the quiz', async () => {
      await host.del(`quiz?id=${Q(id)}`);
      host.navigate(pageHref(host, ''));
    });
  };
  const tabs: Array<{ name: string; label: string; show: boolean }> = [
    { name: '', label: 'My scores', show: true },
    { name: 'compare', label: 'How you compare', show: true },
    { name: 'results', label: 'Results', show: may.results },
    { name: 'questions', label: 'Questions', show: may.edit },
  ];
  const active = tabs.find((held) => held.name === tab && held.show)?.name ?? '';
  return (
    <Surface>
      <Page>
        <div className="qz">
          {data.course && (
            <Link className="qz-eyebrow" to={pageHref(host, `course/${Q(data.course.id)}`)}>
              {data.course.title} · Quiz {data.place} of {data.of}
            </Link>
          )}
          <div className="qz-row" style={{ alignItems: 'flex-start' }}>
            <h1 className="qz-h1" style={{ flex: '1 1 400px' }}>
              {quiz.title}
            </h1>
            <span className="qz-head-actions">
              {may.edit && data.askable > 0 && (
                <Button size="sm" onClick={() => setMakingDeck(true)}>
                  Make flashcards from it
                </Button>
              )}
              {may.manage && (
                <Button size="sm" variant="quiet" onClick={remove}>
                  Delete
                </Button>
              )}
            </span>
          </div>
          <dl className="qz-props">
            {may.edit && (
              <>
                <dt>Course</dt>
                <dd>
                  <Select aria-label="Course" value={quiz.course ?? ''} onChange={(event: { target: HTMLSelectElement }) => patch({ course: event.target.value || null })}>
                    <option value="">-</option>
                    {(overview?.courses ?? []).map((held) => (
                      <option key={held.id} value={held.id}>
                        {held.title}
                      </option>
                    ))}
                  </Select>
                </dd>
              </>
            )}
            <dt>Status</dt>
            <dd>
              <span className={`qz-badge${quiz.status === 'open' ? ' good' : ''}`}>{quiz.status === 'open' ? 'Open' : 'Closed'}</span>
              {may.edit && (
                <Button
                  size="sm"
                  disabled={quiz.status === 'closed' && data.askable === 0}
                  title={quiz.status === 'closed' && data.askable === 0 ? 'Add a question first' : undefined}
                  onClick={() => patch({ status: quiz.status === 'open' ? 'closed' : 'open' })}
                >
                  {quiz.status === 'open' ? 'Close quiz' : 'Open quiz'}
                </Button>
              )}
              {may.edit && data.askable === 0 && !quiz.closed && (
                <Text tone="faint" size="sm">
                  Opens as soon as it has a question
                </Text>
              )}
            </dd>
            <dt>Draws from</dt>
            <dd>
              <LinkPills
                links={quiz.draws_from}
                editable={may.edit}
                label="Add content…"
                picks={picks ? { blueprints: picks.blueprints, groups: [] } : null}
                onChange={(draws_from) => patch({ draws_from })}
              />
            </dd>
            <dt>Created by</dt>
            <dd>
              {quiz.created_by ? <UserPill alias={quiz.created_by} name={data.created_by_name} /> : <Text tone="faint">Unknown</Text>}
              {may.manage && (
                <span className="qz-add">
                  <Select aria-label="Change who created it" value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && patch({ created_by: event.target.value })}>
                    <option value="" hidden>
                      {quiz.created_by ? 'Change…' : 'Set creator…'}
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
            {may.results && (
              <>
                <dt>
                  Proctors <HelpMark tip="Can edit the quiz and see all test results" />
                </dt>
                <dd>
                  {quiz.proctors.map((alias) => (
                    <UserPill key={alias} alias={alias} name={data.proctor_names[alias]}>
                      {may.manage && (
                        <button aria-label={`Remove @${alias}`} onClick={() => patch({ proctors: quiz.proctors.filter((held) => held !== alias) })}>
                          ×
                        </button>
                      )}
                    </UserPill>
                  ))}
                  {!may.manage && quiz.proctors.length === 0 && <Text tone="faint">None</Text>}
                  {may.manage && (
                    <span className="qz-add">
                      <Select aria-label="Add proctor" value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && patch({ proctors: [...quiz.proctors, event.target.value] })}>
                        <option value="" hidden>
                          Add proctor…
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
                </Link>
              ))}
          </nav>
          {active === '' && <MyScoresTab view={data} />}
          {active === 'compare' && <CompareTab id={quiz.id} />}
          {active === 'results' && <ResultsTab view={data} />}
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

function Take({ id, kind, mode }: { id: string; kind: AttemptKind; mode: AttemptMode }): JSX.Element {
  const host = usePluginHost();
  const { data, error } = useData<QuizView>(`quiz?id=${Q(id)}`);
  useTrail(
    data
      ? [{ label: 'Academy', href: pageHref(host, '') }, { label: data.quiz.id, mono: true, href: pageHref(host, `quiz/${Q(id)}`) }, { label: kind === 'official' ? 'Official attempt' : 'Practice' }]
      : null,
  );
  // what is asked is fixed when the attempt starts, so a file changing under it never moves a question
  const [items, setItems] = useState<Array<{ question: Question; order: number[]; chosen: number | null }> | null>(null);
  const [position, setPosition] = useState(0);
  const [finished, setFinished] = useState<Submitted | null>(null);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!data || items) return;
    const wanted = mode === 'missed' ? data.practice.missed : mode === 'unseen' ? data.practice.unseen : data.whole_quiz;
    const byId = new Map(data.quiz.questions.map((question) => [question.id, question]));
    const asked = wanted.flatMap((question) => byId.get(question) ?? []);
    setItems((mode === 'whole' ? asked : shuffle(asked)).map((question) => ({ question, order: shuffle(question.options.map((_, index) => index)), chosen: null })));
  }, [data, items, mode]);

  if (error) return <Failed message={error} />;
  if (!data || !items) return <Loading />;
  const back = pageHref(host, `quiz/${Q(id)}`);

  if (data.quiz.status === 'closed' && !finished && (kind === 'official' || !data.may.edit)) {
    return (
      <Surface>
        <Page>
          <div className="qz">
            <Empty>This quiz is closed. You can take it once it opens.</Empty>
            <div className="qz-actions">
              <Link className="qz-btn" to={back}>
                Back to quiz
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
            <Empty>There is nothing to ask here right now.</Empty>
            <div className="qz-actions">
              <Link className="qz-btn" to={back}>
                Back to quiz
              </Link>
            </div>
          </div>
        </Page>
      </Surface>
    );
  }

  if (finished) {
    const { attempt } = finished;
    return (
      <Surface>
        <Page>
          <div className="qz">
            <div className="qz-card qz-hero">
              {finished.first && <span className="qz-badge accent">First attempt</span>}
              {finished.new_best && <span className="qz-badge good">New personal best</span>}
              <div className="qz-score">{asPercent(finished.percent)}</div>
              <div>
                {attempt.score} of {attempt.total} correct
              </div>
              <div className="qz-muted qz-small" style={{ marginTop: 6 }}>
                <Delta change={finished.change} suffix="vs your last try" />
              </div>
            </div>
            <div className="qz-stats" style={{ marginTop: 18 }}>
              <Stat
                label="Saved as"
                value={<span style={{ fontSize: 26 }}>{attempt.kind === 'official' ? 'Official' : 'Practice'}</span>}
                sub={attempt.kind === 'official' ? 'Goes out with the next commit' : 'On this machine only'}
              />
              <Stat
                label="Quiz average"
                value={asPercent(finished.average)}
                sub={
                  <Link className="qz-link" to={pageHref(host, `quiz/${Q(id)}/compare`)}>
                    See how you compare
                  </Link>
                }
              />
              <Stat label="Official attempts" value={finished.official_attempts} sub="Saved to your history" />
            </div>
            <h2 className="qz-h2">Review</h2>
            <Review attempt={attempt} />
            <div className="qz-actions" style={{ marginTop: 22 }}>
              <Link className="qz-btn" to={back}>
                Back to quiz
              </Link>
              {finished.practice.missed.length > 0 && (
                <Link className="qz-btn secondary" to={`${pageHref(host, `take/${Q(id)}`)}?kind=practice&mode=missed&again=${Q(attempt.id)}`}>
                  Retry missed ({finished.practice.missed.length})
                </Link>
              )}
            </div>
          </div>
        </Page>
      </Surface>
    );
  }

  const item = items[position]!;
  const { question, chosen, order } = item;
  const answered = chosen !== null;
  const right = chosen === question.answer;
  const last = position === items.length - 1;
  const see = async (): Promise<void> => {
    setSending(true);
    setFailure(null);
    try {
      const answers = items.map((held) => ({ question: held.question.id, chosen: held.chosen as number }));
      setFinished(await host.post<Submitted>('attempt', { quiz: id, kind, mode, answers }));
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  };
  return (
    <Surface>
      <Page>
        <div className="qz" style={{ maxWidth: 760 }}>
          <div className="qz-row">
            <span className="qz-muted qz-small" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {data.quiz.title}
              {kind === 'official' ? (
                <span className="qz-badge accent">Official</span>
              ) : (
                <span className="qz-badge">
                  <LaptopMark /> Practice
                </span>
              )}
            </span>
            <span className="qz-badge accent">
              {position + 1} / {items.length}
            </span>
          </div>
          <div className="qz-progress" role="progressbar" aria-valuenow={position} aria-valuemin={0} aria-valuemax={items.length} aria-label="Progress">
            <div style={{ width: `${(position / items.length) * 100}%` }} />
          </div>
          <p className="qz-prompt">{question.prompt}</p>
          {order.map((index) => {
            const state = answered && index === question.answer ? ' correct' : answered && index === chosen ? ' wrong' : '';
            return (
              <button key={index} className={`qz-option${state}`} disabled={answered} onClick={() => setItems(items.map((held, at) => (at === position ? { ...held, chosen: index } : held)))}>
                {question.options[index]}
              </button>
            );
          })}
          {answered && (
            <>
              <div className={`qz-feedback ${right ? 'correct' : 'wrong'}`}>
                <strong>{right ? 'Correct.' : 'Not quite.'}</strong> {question.why}
                {question.reference && <div className="qz-muted qz-small">{question.reference}</div>}
              </div>
              {failure && (
                <div style={{ marginBottom: 12 }}>
                  <Notice tone="error">{failure}</Notice>
                </div>
              )}
              {last ? (
                <button className="qz-btn" disabled={sending} onClick={see} autoFocus>
                  {sending ? '…' : 'See results'}
                </button>
              ) : (
                <button className="qz-btn" onClick={() => setPosition(position + 1)} autoFocus>
                  Next question
                </button>
              )}
            </>
          )}
          <p style={{ marginTop: 30 }}>
            <Link className="qz-muted qz-small" to={back}>
              Quit without saving
            </Link>
          </p>
        </div>
      </Page>
    </Surface>
  );
}

// ---- a deck and its tabs ---------------------------------------------------------------------------------------------

const STATE_LABEL: Record<Standing['state'], string> = { new: 'Not yet seen', learning: 'Still learning', learned: 'Learned' };

const studyHref = (host: PluginHost, query: Record<string, string>): string => `${pageHref(host, 'study')}?${new URLSearchParams(query).toString()}`;

// When a card or a deck was last studied, as a record of the past, never a nudge.
function lastSeen(iso: string | null, got: boolean | null): string {
  if (!iso) return 'never';
  return `${formatDate(iso)}${got === null ? '' : got ? ', got it' : ', still learning'}`;
}

function DeckProgressTab({ view }: { view: DeckView }): JSX.Element {
  const host = usePluginHost();
  const { deck, progress } = view;
  const bars: Array<{ label: string; n: number; mine: boolean }> = [
    { label: 'Not yet seen', n: progress.new, mine: false },
    { label: 'Still learning', n: progress.learning, mine: false },
    { label: 'Learned', n: progress.learned, mine: true },
  ];
  const tallest = Math.max(1, ...bars.map((bar) => bar.n));
  const modeLabel = (mode: StudyMode, cards: number): string => (mode === 'whole' ? 'Whole deck' : mode === 'missed' ? 'Missed only' : `Next ${cards}`);
  return (
    <>
      <div className="qz-stats">
        <Stat hero label="Learned" value={`${progress.learned} of ${progress.of}`} sub="Got right twice in a row" />
        <Stat label="Still learning" value={progress.learning} sub="Missed lately; they come first" />
        <Stat label="Not yet seen" value={progress.new} sub="They come after those" />
      </div>
      {view.may.study && (
        <div className="qz-actions" style={{ marginTop: 0 }}>
          <Link className="qz-btn" to={studyHref(host, { deck: deck.id })}>
            Study {Math.min(deck.per_session, view.studiable)} cards
          </Link>
          {view.missed_last > 0 && (
            <Link className="qz-btn secondary" to={studyHref(host, { deck: deck.id, mode: 'missed' })}>
              Study the {view.missed_last} you missed
            </Link>
          )}
          <Link className="qz-btn secondary" to={studyHref(host, { deck: deck.id, mode: 'whole' })}>
            Study the whole deck
          </Link>
        </div>
      )}
      <h2 className="qz-h2">Where the cards stand</h2>
      <div className="qz-card">
        <div className="qz-bars" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="img" aria-label={bars.map((bar) => `${bar.n} ${bar.label.toLowerCase()}`).join(', ')}>
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
      <h2 className="qz-h2">History</h2>
      {progress.history.length === 0 ? (
        <Empty>You have not studied this deck yet.</Empty>
      ) : (
        <div className="qz-card qz-scroll" style={{ padding: '6px 18px' }}>
          <table className="qz-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Studied</th>
                <th className="num">Cards</th>
                <th className="num">Still learning</th>
                <th className="num">Learned after</th>
              </tr>
            </thead>
            <tbody>
              {progress.history.map((session) => (
                <tr key={session.id}>
                  <td>
                    {formatDate(session.completed_at)}{' '}
                    {!session.shared && (
                      <span title="On this machine only">
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
      <p className="qz-muted qz-small">You answer each card yourself, so a deck keeps no score, and nobody else is shown where you stand in it.</p>
    </>
  );
}

// The cards as everyone may read them, with where the person stands with each.
function CardList({ view }: { view: DeckView }): JSX.Element {
  const { deck, standings } = view;
  if (deck.cards.length === 0) return <Empty>No cards yet.</Empty>;
  return (
    <div>
      {deck.cards.map((card) => {
        const standing = standings[card.id];
        return (
          <div className="qz-review" key={card.id}>
            <div className="qz-row">
              <strong style={{ flex: '1 1 300px' }}>{card.front}</strong>
              {standing && <span className={`qz-badge${standing.state === 'learned' ? ' good' : standing.state === 'new' ? ' accent' : ''}`}>{STATE_LABEL[standing.state]}</span>}
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
  const act = useAct();
  const { deck, standings } = view;
  const alias = host.user?.alias ?? null;
  const [mode, setMode] = useState<'builder' | 'source'>('builder');
  const [picked, setPicked] = useState<string | null>(deck.cards[0]?.id ?? null);
  const [draft, setDraft] = useState<Card | null>(null);
  const [count, setCount] = useState(generate ?? '20');
  const withQuestions = view.quizzes.filter((quiz) => quiz.questions > 0);
  const held = deck.cards.find((card) => card.id === picked) ?? null;
  const editing = draft ?? held;
  const dirty = draft !== null;
  const change = (patch: Partial<Card>): void => setDraft({ ...(editing as Card), ...patch });
  const save = async (): Promise<void> => {
    if (!draft) return;
    const ok = await act('Could not save the card', () => host.put(`card?id=${Q(deck.id)}`, { card: draft }));
    if (ok) {
      setPicked(draft.id);
      setDraft(null);
      reload();
    }
  };
  const add = async (): Promise<void> => {
    await act('Could not add a card', async () => {
      const blank = await host.post<Card>(`card/blank?id=${Q(deck.id)}`);
      setPicked(blank.id);
      setDraft(blank);
    });
  };
  const remove = async (): Promise<void> => {
    if (!held) {
      setDraft(null);
      setPicked(deck.cards[0]?.id ?? null);
      return;
    }
    if (!(await host.dialog.confirm('Delete this card? Past study sessions keep their copy of it.', { title: 'Delete card', ok: 'Delete', danger: true }))) return;
    await act('Could not delete the card', async () => {
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
    void act('Could not reorder the cards', async () => {
      await host.put(`cards/order?id=${Q(deck.id)}`, { ids });
      reload();
    });
  };
  const fromQuiz = (quiz: string): void => {
    void act('Could not make cards from the quiz', async () => {
      const made = await host.post<{ added: number }>(`cards/from-quiz?id=${Q(deck.id)}&quiz=${Q(quiz)}`);
      host.toast(made.added === 0 ? 'The deck already has a card for every question of that quiz' : `Added ${made.added} ${made.added === 1 ? 'card' : 'cards'} from the quiz`, made.added === 0 ? 'info' : 'success');
      reload();
    });
  };
  const rows = draft && !held ? [...deck.cards, draft] : deck.cards;
  const standing = held ? standings[held.id] : undefined;
  return (
    <>
      <Row justify="between" wrap gap="sm">
        <Seg>
          <SegItem active={mode === 'builder'} selected={mode === 'builder'} onClick={() => setMode('builder')}>
            Builder
          </SegItem>
          <SegItem active={mode === 'source'} selected={mode === 'source'} onClick={() => setMode('source')}>
            Source
          </SegItem>
        </Seg>
        <Row gap="sm" wrap>
          <span style={{ width: 70 }}>
            <Input aria-label="How many cards to generate" type="number" value={count} onChange={(event: { target: HTMLInputElement }) => setCount(event.target.value)} />
          </span>
          <Ask label="Generate cards" title={`Cards: ${deck.title}`} text={generateCardsText(deck, Number(count) || 20, alias)} />
          {withQuestions.length > 0 && (
            <span className="qz-add">
              <Select aria-label="Make cards from a quiz" value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && fromQuiz(event.target.value)}>
                <option value="" hidden>
                  Make cards from a quiz…
                </option>
                {withQuestions.map((quiz) => (
                  <option key={quiz.id} value={quiz.id}>
                    {quiz.title} ({quiz.questions} questions)
                  </option>
                ))}
              </Select>
            </span>
          )}
          <Button size="sm" onClick={add}>
            Add card
          </Button>
        </Row>
      </Row>
      {generate && deck.cards.length === 0 && (
        <div style={{ marginTop: 12 }}>
          <Notice>Press Generate cards to have your agent write them in Chat. They appear here as it adds them, and your agent opens the deck once the last one is in.</Notice>
        </div>
      )}
      {mode === 'source' ? (
        <SourceEditor id={deck.id} route="deck/source" what="deck" reload={reload} />
      ) : (
        <div className="qz-builder" style={{ marginTop: 14 }}>
          <div className="qz-qlist">
            {rows.map((card, index) => {
              const state = standings[card.id]?.state;
              return (
                <button
                  key={card.id}
                  className="qz-qrow"
                  aria-current={card.id === picked ? 'true' : undefined}
                  onClick={() => {
                    setPicked(card.id);
                    setDraft(null);
                  }}
                >
                  <span className="qz-muted">{index + 1}</span>
                  <span className="qz-clamp" style={{ flex: 1 }}>
                    {card.front || 'New card'}
                  </span>
                  {state && <span className={`qz-badge${state === 'new' ? ' accent' : state === 'learned' ? ' good' : ''}`}>{STATE_LABEL[state]}</span>}
                </button>
              );
            })}
            {rows.length === 0 && (
              <div style={{ padding: 10 }}>
                <Text tone="muted" size="sm">
                  No cards yet. Generate them, make them from a quiz, or add the first by hand.
                </Text>
              </div>
            )}
          </div>
          {editing && (
            <div className="qz-qform">
              <div>
                <Row justify="between" wrap gap="sm">
                  <label className="qz-label" htmlFor="qz-front" style={{ margin: 0 }}>
                    Front
                  </label>
                  <Row gap="xs" wrap>
                    {held && <Ask label="Regenerate card" title={`Regenerate: ${held.front.slice(0, 40)}`} text={regenerateCardText(deck, held)} />}
                    {held && (
                      <>
                        <Button size="sm" variant="quiet" disabled={deck.cards[0]?.id === held.id} aria-label="Move card up" onClick={() => nudge(held.id, -1)}>
                          ▲
                        </Button>
                        <Button size="sm" variant="quiet" disabled={deck.cards.at(-1)?.id === held.id} aria-label="Move card down" onClick={() => nudge(held.id, 1)}>
                          ▼
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="quiet" aria-label="Delete card" onClick={remove}>
                      Delete
                    </Button>
                  </Row>
                </Row>
                <div style={{ marginTop: 4 }}>
                  <Textarea id="qz-front" rows={2} value={editing.front} onChange={(event: { target: HTMLTextAreaElement }) => change({ front: event.target.value })} />
                </div>
              </div>
              <label>
                <span className="qz-label">Back</span>
                <Textarea rows={3} value={editing.back} onChange={(event: { target: HTMLTextAreaElement }) => change({ back: event.target.value })} />
              </label>
              <label>
                <span className="qz-label">Reference</span>
                <Input value={editing.reference} onChange={(event: { target: HTMLInputElement }) => change({ reference: event.target.value })} />
              </label>
              <div className="qz-card qz-flash-preview">
                <span className="qz-label">How it shows{standing ? ` · you last saw it ${lastSeen(standing.last_seen, standing.last_got)}` : ''}</span>
                <div className="qz-flash-front">{editing.front || 'The front'}</div>
                <div className="qz-flash-rule" />
                <div className="qz-small">{editing.back || 'The back'}</div>
              </div>
              <Row justify="end" gap="sm">
                <Button disabled={!dirty} onClick={() => (held ? setDraft(null) : void remove())}>
                  Discard
                </Button>
                <Button variant="primary" disabled={!dirty} onClick={save}>
                  Save
                </Button>
              </Row>
              <Text tone="faint" size="sm" block>
                One fact a card, a short front, a back that stands on its own. Editing a card keeps everyone's progress on it; a regenerated card starts over as not yet seen.
              </Text>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function DeckPage({ id, tab, generate }: { id: string; tab: string; generate: string | null }): JSX.Element {
  const host = usePluginHost();
  const act = useAct();
  const { data, error, reload } = useData<DeckView>(`deck?id=${Q(id)}`);
  const { data: picks } = useData<Pickable>('pickable');
  const { data: overview } = useData<Overview>('overview');
  useTrail(
    data
      ? [
          { label: 'Academy', href: pageHref(host, '') },
          ...(data.course ? [{ label: data.course.title, href: pageHref(host, `course/${Q(data.course.id)}`) }] : []),
          { label: data.deck.id, mono: true },
        ]
      : null,
  );
  if (error) return <Failed message={error} />;
  if (!data) return <Loading />;
  const { deck, may } = data;
  const patch = (body: Record<string, unknown>): void => {
    void act('Could not change the deck', async () => {
      await host.put(`deck?id=${Q(id)}`, body);
      reload();
    });
  };
  const remove = async (): Promise<void> => {
    if (!(await host.dialog.confirm(`Delete ${deck.title}? People's study sessions with it stay in their history.`, { title: 'Delete deck', ok: 'Delete', danger: true }))) return;
    await act('Could not delete the deck', async () => {
      await host.del(`deck?id=${Q(id)}`);
      host.navigate(pageHref(host, ''));
    });
  };
  const tabs: Array<{ name: string; label: string }> = [
    { name: '', label: 'My progress' },
    { name: 'cards', label: `Cards (${deck.cards.length})` },
  ];
  const active = tabs.find((held) => held.name === tab)?.name ?? '';
  return (
    <Surface>
      <Page>
        <div className="qz">
          {data.course ? (
            <Link className="qz-eyebrow" to={pageHref(host, `course/${Q(data.course.id)}`)}>
              Deck · {data.course.title} · {data.place} of {data.of}
            </Link>
          ) : (
            <span className="qz-eyebrow">Deck</span>
          )}
          <div className="qz-row" style={{ alignItems: 'flex-start' }}>
            <h1 className="qz-h1" style={{ flex: '1 1 400px' }}>
              {deck.title}
            </h1>
            <span className="qz-head-actions">
              {may.study && data.studiable > 0 && (
                <Link className="qz-btn" to={studyHref(host, { deck: deck.id })}>
                  Study {Math.min(deck.per_session, data.studiable)} cards
                </Link>
              )}
              {may.manage && (
                <Button size="sm" variant="quiet" onClick={remove}>
                  Delete
                </Button>
              )}
            </span>
          </div>
          <dl className="qz-props">
            {may.edit && (
              <>
                <dt>Course</dt>
                <dd>
                  <Select aria-label="Course" value={deck.course ?? ''} onChange={(event: { target: HTMLSelectElement }) => patch({ course: event.target.value || null })}>
                    <option value="">-</option>
                    {(overview?.courses ?? []).map((held) => (
                      <option key={held.id} value={held.id}>
                        {held.title}
                      </option>
                    ))}
                  </Select>
                </dd>
              </>
            )}
            <dt>Status</dt>
            <dd>
              <span className={`qz-badge${deck.status === 'open' ? ' good' : ''}`}>{deck.status === 'open' ? 'Open' : 'Closed'}</span>
              {may.edit && (
                <Button
                  size="sm"
                  disabled={deck.status === 'closed' && data.studiable === 0}
                  title={deck.status === 'closed' && data.studiable === 0 ? 'Add a card first' : undefined}
                  onClick={() => patch({ status: deck.status === 'open' ? 'closed' : 'open' })}
                >
                  {deck.status === 'open' ? 'Close deck' : 'Open deck'}
                </Button>
              )}
              {may.edit && data.studiable === 0 && !deck.closed && (
                <Text tone="faint" size="sm">
                  Opens as soon as it has a card
                </Text>
              )}
            </dd>
            <dt>Draws from</dt>
            <dd>
              <LinkPills
                links={deck.draws_from}
                editable={may.edit}
                label="Add content…"
                picks={picks ? { blueprints: picks.blueprints, groups: [] } : null}
                onChange={(draws_from) => patch({ draws_from })}
              />
              {data.made_from && (
                <Link className="qz-pill" to={pageHref(host, `quiz/${Q(data.made_from.id)}`)}>
                  {data.made_from.id}, made from the quiz
                </Link>
              )}
            </dd>
            <dt>Cards a session</dt>
            <dd>
              {may.edit ? (
                <span style={{ width: 80 }}>
                  <Input
                    aria-label="Cards a session"
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
            <dt>Last studied</dt>
            <dd>{data.progress.last_studied ? formatDate(data.progress.last_studied) : <Text tone="faint">Not yet</Text>}</dd>
            <dt>Created by</dt>
            <dd>
              {deck.created_by ? <UserPill alias={deck.created_by} name={data.created_by_name} /> : <Text tone="faint">Unknown</Text>}
              {may.manage && (
                <span className="qz-add">
                  <Select aria-label="Change who created it" value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && patch({ created_by: event.target.value })}>
                    <option value="" hidden>
                      {deck.created_by ? 'Change…' : 'Set creator…'}
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
            {may.edit && (
              <>
                <dt>
                  Editors <HelpMark tip="Can change the deck and its cards" />
                </dt>
                <dd>
                  {deck.proctors.map((alias) => (
                    <UserPill key={alias} alias={alias} name={data.proctor_names[alias]}>
                      {may.manage && (
                        <button aria-label={`Remove @${alias}`} onClick={() => patch({ proctors: deck.proctors.filter((held) => held !== alias) })}>
                          ×
                        </button>
                      )}
                    </UserPill>
                  ))}
                  {!may.manage && deck.proctors.length === 0 && <Text tone="faint">None</Text>}
                  {may.manage && (
                    <span className="qz-add">
                      <Select aria-label="Add editor" value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && patch({ proctors: [...deck.proctors, event.target.value] })}>
                        <option value="" hidden>
                          Add editor…
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
  const query = new URLSearchParams({ ...(deck ? { deck } : {}), ...(course ? { course } : {}), mode });
  const { data, error } = useData<StudyView>(`study?${query.toString()}`);
  const sitting = useRef<{ queue: number[]; position: number; flipped: boolean; answers: Array<{ deck: string; card: string; got: boolean; at: string }>; again: Set<number>; saving: boolean } | null>(null);
  const [, redraw] = useState(0);
  const [finished, setFinished] = useState<Studied | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(new Date().toISOString());
  const back = deck ? pageHref(host, `deck/${Q(deck)}`) : course ? pageHref(host, `course/${Q(course)}`) : pageHref(host, 'keep-studying');
  useTrail(
    data
      ? [
          { label: 'Academy', href: pageHref(host, '') },
          ...(deck ? [{ label: deck, mono: true, href: back }] : [{ label: 'Keep studying', href: pageHref(host, 'keep-studying') }]),
          { label: finished ? 'Session done' : 'Studying' },
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
            <Empty>{mode === 'missed' ? 'You missed nothing last time.' : 'There are no cards to study here yet.'}</Empty>
            <div className="qz-actions">
              <Link className="qz-btn" to={back}>
                Back
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
              {current && <span className={`qz-badge${current.state === 'new' ? ' accent' : ''}`}>{current.state === 'new' ? 'New' : current.state === 'learned' ? 'Learned' : 'Learning'}</span>}
            </span>
            <span className="qz-badge accent">
              {Math.min(now.position + 1, total)} of {total}
            </span>
          </div>
          <div className="qz-progress" role="progressbar" aria-valuenow={now.position} aria-valuemin={0} aria-valuemax={total} aria-label="Progress">
            <div style={{ width: `${(now.position / total) * 100}%` }} />
          </div>
          {current ? (
            <button className="qz-card qz-flash" disabled={flipped} aria-label={flipped ? 'The answer is showing' : 'Show the answer'} onClick={flip}>
              <span className="qz-flash-front">{current.card.front}</span>
              {flipped ? (
                <>
                  <span className="qz-flash-rule" />
                  <span className="qz-flash-back">{current.card.back}</span>
                  {current.card.reference && <span className="qz-muted qz-small">{current.card.reference}</span>}
                </>
              ) : (
                <span className="qz-muted qz-small">Tap the card or press Space to see the answer</span>
              )}
            </button>
          ) : (
            !failure && (
              <p className="qz-muted" style={{ marginTop: 18, textAlign: 'center' }}>
                Saving your session…
              </p>
            )
          )}
          {failure && (
            <div style={{ marginTop: 12 }}>
              <Notice tone="error">{failure}</Notice>
              <button className="qz-btn" disabled={now.saving} onClick={() => void save()}>
                Try saving again
              </button>
            </div>
          )}
          {flipped && current && (
            <>
              <div className="qz-grades">
                <button className="qz-option" disabled={now.saving} onClick={() => answer(false)}>
                  <strong>Still learning</strong>
                  <span className="qz-muted qz-small">{now.again.has(now.queue[now.position]!) ? 'Comes back next time' : 'Comes back later in this session'}</span>
                </button>
                <button className="qz-option" disabled={now.saving} onClick={() => answer(true)}>
                  <strong>Got it</strong>
                  <span className="qz-muted qz-small">Counts toward learned</span>
                </button>
              </div>
              <p className="qz-muted qz-small" style={{ marginTop: 10, textAlign: 'center' }}>
                Keys 1 and 2 answer. A card is learned once you get it twice in a row, and one you miss goes back to learning.
              </p>
            </>
          )}
          {current && (
            <p style={{ marginTop: 30 }}>
              <button className="qz-quiet-link qz-muted qz-small" disabled={now.saving} onClick={() => void save()}>
                {answered > 0 ? `Stop for now. The ${answered} ${answered === 1 ? 'answer' : 'answers'} you gave are kept.` : 'Stop for now'}
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
            <span className="qz-badge good">Session done</span>
            <div className="qz-score">{studied.cards}</div>
            <div>
              {studied.cards === 1 ? 'card' : 'cards'} studied in {studied.minutes} {studied.minutes === 1 ? 'minute' : 'minutes'}
            </div>
            <div className="qz-muted qz-small" style={{ marginTop: 6 }}>
              {left === 0 ? 'Every card is learned.' : `${left} ${left === 1 ? 'card' : 'cards'} left to learn${one ? ' in this deck' : ' across these decks'}`}
            </div>
          </div>
          <div className="qz-stats" style={{ marginTop: 18 }}>
            <Stat label="Got it" value={studied.got} sub={`Of the ${studied.cards} you studied`} />
            <Stat label="Still learning" value={studied.still_learning} sub="They come first next time" />
            <Stat label="Learned" value={`${learned} of ${of}`} sub={gained > 0 ? <span className="qz-up">+{gained} this session</span> : 'Got right twice in a row'} />
          </div>
          <div className="qz-card qz-row" style={{ padding: '14px 18px', justifyContent: 'flex-start' }}>
            {studied.shared ? (
              <>
                <span className="qz-badge accent">Shared</span>
                <span className="qz-small" style={{ flex: '1 1 300px' }}>
                  This session is in your history and goes out with the next commit, so your progress follows you to any machine.
                </span>
              </>
            ) : (
              <>
                <span className="qz-badge">
                  <LaptopMark /> Local
                </span>
                <span className="qz-small" style={{ flex: '1 1 300px' }}>
                  Saved on this machine only. Pick who you are in the project to keep your sessions with it.
                </span>
              </>
            )}
          </div>
          {studied.missed.length > 0 && (
            <>
              <h2 className="qz-h2">The ones you missed</h2>
              {studied.missed.map((card, index) => (
                <div className="qz-review" key={index}>
                  <span className="qz-no">Still learning</span> {card.front}
                  <div className="qz-muted qz-small">{card.back}</div>
                </div>
              ))}
            </>
          )}
          <div className="qz-actions" style={{ marginTop: 22 }}>
            <Link className="qz-btn" to={studyHref(host, { ...(deck ? { deck } : {}), ...(course ? { course } : {}), again })}>
              Keep going
            </Link>
            {deck && studied.missed.length > 0 && (
              <Link className="qz-btn secondary" to={studyHref(host, { deck, mode: 'missed', again })}>
                Study the {studied.missed.length} you missed
              </Link>
            )}
            <Link className="qz-btn secondary" to={back}>
              {deck ? 'Back to the deck' : course ? 'Back to the course' : 'Back to Keep studying'}
            </Link>
          </div>
          <p className="qz-muted qz-small" style={{ marginTop: 10 }}>
            Study whenever you like, as often as you like. Nothing in a deck waits on a date.
          </p>
        </div>
      </Page>
    </Surface>
  );
}

// ---- Keep studying -----------------------------------------------------------------------------------------------------

function KeepStudying(): JSX.Element {
  const host = usePluginHost();
  const { data, error } = useData<KeepView>('keep-studying');
  const { data: overview } = useData<Overview>('overview');
  const [making, setMaking] = useState(false);
  useTrail([{ label: 'Academy', href: pageHref(host, '') }, { label: 'Keep studying' }]);
  if (error) return <Failed message={error} />;
  if (!data) return <Loading />;
  const toLearn = data.learning + data.unseen;
  return (
    <Surface>
      <Page>
        <div className="qz">
          <span className="qz-eyebrow">Pick up where you left off</span>
          <div className="qz-row" style={{ alignItems: 'flex-start' }}>
            <h1 className="qz-h1" style={{ flex: '1 1 400px' }}>
              {data.decks.length === 0 ? (
                'No decks yet'
              ) : toLearn === 0 ? (
                <>
                  <span>Every card</span> is learned
                </>
              ) : (
                <>
                  <span>
                    {toLearn} {toLearn === 1 ? 'card' : 'cards'}
                  </span>{' '}
                  still to learn
                </>
              )}
            </h1>
            {data.decks.length > 0 && data.may_study && (
              <Link className="qz-btn" to={pageHref(host, 'study')}>
                Study across your decks
              </Link>
            )}
          </div>
          {data.decks.length === 0 ? (
            <>
              <p className="qz-muted">A deck is flashcards on your content: a front, a back, and where it comes from. Your agent can write them, or you can make them from a quiz.</p>
              <div className="qz-actions">
                <button className="qz-btn" onClick={() => setMaking(true)}>
                  New deck
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="qz-muted" style={{ margin: 0 }}>
                Twenty cards from your decks: the ones you are still learning first, then ones you have not seen, then the learned ones you studied longest ago.
              </p>
              <div className="qz-stats" style={{ marginTop: 18 }}>
                <Stat hero label="Still learning" value={data.learning} sub="Cards you missed lately" />
                <Stat label="Not yet seen" value={data.unseen} sub="Across your decks" />
                <Stat label="Learned" value={`${data.learned} of ${data.cards}`} sub="Got right twice in a row" />
              </div>
              <h2 className="qz-h2">By deck</h2>
              {data.decks.map((row) => (
                <div className="qz-card qz-quiz" key={row.id}>
                  <span style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <Link to={pageHref(host, `deck/${Q(row.id)}`)} style={{ display: 'block', fontWeight: 600 }}>
                      {row.title}
                    </Link>
                    <span className="qz-muted qz-small">
                      {row.course_title ?? 'One-off deck'} · {row.learned} of {row.cards} learned · {row.last_studied ? `last studied ${formatDate(row.last_studied)}` : 'not studied yet'}
                    </span>
                  </span>
                  {row.learning > 0 && <span className="qz-badge">{row.learning} still learning</span>}
                  {row.unseen > 0 && <span className="qz-badge accent">{row.unseen} not yet seen</span>}
                  {row.learning === 0 && row.unseen === 0 && row.cards > 0 && <span className="qz-badge good">All learned</span>}
                  {row.status === 'closed' && !row.may_edit ? (
                    <span className="qz-badge">Closed</span>
                  ) : (
                    <Link className="qz-btn secondary" to={studyHref(host, { deck: row.id })}>
                      Study
                    </Link>
                  )}
                </div>
              ))}
              <p className="qz-muted qz-small">Nothing here waits on a date. Study any deck whenever you like.</p>
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
                {row.best === null ? 'Not yet taken' : `Your best ${asPercent(row.best)}`}. {row.questions} questions.
              </div>
              <div style={{ marginTop: 8 }}>
                {row.status === 'closed' ? (
                  <span className="qz-badge">Closed</span>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => host.navigate(pageHref(host, `quiz/${Q(row.id)}`))}>
                    {row.best === null ? 'Take' : 'Retake'}
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
                {row.learned + row.learning === 0 ? 'Not yet studied' : `${row.learned} of ${row.cards} learned`}. {row.cards} cards.
              </div>
              <div style={{ marginTop: 8 }}>
                {row.status === 'closed' ? (
                  <span className="qz-badge">Closed</span>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => host.navigate(`${pageHref(host, 'study')}?deck=${Q(row.id)}`)}>
                    Study
                  </Button>
                )}
              </div>
            </div>
          ))}
          {data && data.quizzes.length === 0 && data.decks.length === 0 && (
            <Text tone="muted" size="sm" block>
              No quizzes or decks on this yet.
            </Text>
          )}
          <div>
            <Button size="sm" variant="quiet" disabled={!id} onClick={() => setMaking('quiz')}>
              + New quiz from this
            </Button>
            <Button size="sm" variant="quiet" disabled={!id} onClick={() => setMaking('deck')}>
              + New deck from this
            </Button>
          </div>
          {data?.plan && (
            <div>
              <div className="qz-small qz-muted">
                {data.plan.course}: session {data.plan.place} of {data.plan.of}, {data.plan.sessions_done} done
              </div>
              <div className="qz-progress" style={{ margin: '6px 0 10px' }}>
                <div style={{ width: `${(data.plan.sessions_done / Math.max(1, data.plan.of)) * 100}%` }} />
              </div>
              <Button
                size="sm"
                onClick={() =>
                  void act('Could not mark the session', async () => {
                    await host.put(`session?blueprint=${Q(id!)}`, { done: !data.plan!.done });
                    reload();
                  })
                }
              >
                {data.plan.done ? 'Mark session not done' : 'Mark session done'}
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
