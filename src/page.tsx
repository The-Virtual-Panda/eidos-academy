// Quizzes's page half: its activity in the Primary Sidebar, the list and its filters, a
// course, a quiz and its tabs, taking a quiz, the builder, the view beside a blueprint, and
// the slash commands that bring in the person's own agent.
import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react';
import {
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
  Stack,
  Text,
  Textarea,
  useCrumbs,
  useOpen,
  usePluginHost,
  type AgentPageApi,
  type PagePlugin,
  type PluginHost,
} from 'eidosmd/page';
import { asPercent, Delta, Failed, formatDate, HelpMark, LaptopMark, Loading, Stat, Surface, useAct, useData, UserPill } from './page-kit.tsx';
import type { Attempt, AttemptKind, AttemptMode, Comparison, Course, MyScores, PersonResult, Question, Quiz } from './model.ts';

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
}
interface Overview {
  me: { name: string; alias: string | null; owner: boolean } | null;
  folder: string;
  quizzes: Row_[];
  courses: Array<{ id: string; title: string; created_by: string | null }>;
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
  may: { edit: boolean };
  quizzes: Row_[];
  progress: { taken: number; of: number; average_best: number | null; sessions_done: number; sessions: number };
  content: Array<{ id: string; title: string; rel: string }>;
  sessions: Array<{ id: string; title: string; rel: string; done: boolean }>;
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
    `Run \`eidos instructions quizzes\` first and follow what it says about writing questions, then add each one with \`eidos quizzes question add ${quiz.id}\`.`,
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
    `Run \`eidos instructions quizzes\` first, then write it with \`eidos quizzes question set ${quiz.id} ${question.id} --regenerated\`.`,
  ].join(' ');
}

const studyPlanText = (what: string): string =>
  `Build a study plan for ${what}. Run \`eidos instructions quizzes\` first and follow its section on writing a study plan, and ask me where the sessions should go before you change anything.`;

// ---- the activity ----------------------------------------------------------------------------

function Sidebar(): JSX.Element {
  const host = usePluginHost();
  const { data } = useData<Overview>('overview');
  const alias = data?.me?.alias ?? null;
  const quizzes = data?.quizzes ?? [];
  const here = typeof window === 'undefined' ? '' : window.location.pathname + window.location.search;
  const entry = (label: string, to: string, count?: number): JSX.Element => (
    <NavLink
      key={to}
      href={to}
      active={here === to}
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
  return (
    <Nav>
      <NavHead>
        <b>Quizzes</b>
      </NavHead>
      {entry('All quizzes', root, quizzes.length)}
      {entry('Created by me', `${root}?show=mine`, quizzes.filter((row) => row.created_by === alias).length)}
      {entry('Not yet taken', `${root}?show=untaken`, quizzes.filter((row) => row.best === null).length)}
      {data && data.courses.length > 0 && (
        <>
          <NavGroup>
            <span>Courses</span>
          </NavGroup>
          {data.courses.map((course) => entry(course.title, pageHref(host, `course/${Q(course.id)}`), quizzes.filter((row) => row.course === course.id).length))}
        </>
      )}
      {quizzes.some((row) => row.course === null) && (
        <>
          <NavGroup>
            <span>Quizzes</span>
          </NavGroup>
          {quizzes.filter((row) => row.course === null).map((row) => entry(row.title, pageHref(host, `quiz/${Q(row.id)}`)))}
        </>
      )}
    </Nav>
  );
}

// ---- the list ---------------------------------------------------------------------------------

type SortKey = 'title' | 'course' | 'questions' | 'created_by' | 'best';

function QuizList({ show }: { show: string | null }): JSX.Element {
  const host = usePluginHost();
  const { data, error } = useData<Overview>('overview');
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('');
  const [creator, setCreator] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; turned: boolean } | null>(null);
  const [making, setMaking] = useState<'quiz' | 'course' | null>(null);
  useCrumbs(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const alias = data.me?.alias ?? null;
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const kept = data.quizzes.filter((row) => {
      if (show === 'mine' && row.created_by !== alias) return false;
      if (show === 'untaken' && row.best !== null) return false;
      if (course && (course === 'oneoff' ? row.course !== null : row.course !== course)) return false;
      if (creator && row.created_by !== creator) return false;
      const held = `${row.id} ${row.title} ${row.course_title ?? ''} ${row.draws_from.join(' ')} ${row.created_by ?? ''}`.toLowerCase();
      return words.every((word) => held.includes(word));
    });
    if (!sort) return kept;
    const value = (row: Row_): string | number =>
      sort.key === 'course' ? `${row.course_title ?? '~'} ${row.place ?? 0}` : sort.key === 'best' ? (row.best ?? -1) : sort.key === 'questions' ? row.questions : (row[sort.key] ?? '');
    const ordered = [...kept].sort((a, b) => {
      const [left, right] = [value(a), value(b)];
      return typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
    });
    return sort.turned ? ordered.reverse() : ordered;
  }, [data, search, course, creator, sort, show]);

  if (error) return <Failed message={error} />;
  if (!data) return <Loading />;

  const header = (key: SortKey, label: string, num = false): JSX.Element => (
    <th className={num ? 'num' : undefined} aria-sort={sort?.key === key ? (sort.turned ? 'descending' : 'ascending') : undefined}>
      <button className="qz-sort" onClick={() => setSort(sort?.key !== key ? { key, turned: false } : !sort.turned ? { key, turned: true } : null)}>
        {label}
        {sort?.key === key ? (sort.turned ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );
  const creators = [...new Set(data.quizzes.flatMap((row) => row.created_by ?? []))];
  return (
    <Surface>
      <Page>
        <PageHead>
          <Row justify="between" wrap style={{ width: '100%' }}>
            <Row gap="sm">
              <PageTitle>Quizzes</PageTitle>
              <Text tone="faint">{rows.length}</Text>
            </Row>
            <Row gap="sm">
              <Button onClick={() => setMaking('course')}>New course</Button>
              <Button variant="primary" onClick={() => setMaking('quiz')}>
                New quiz
              </Button>
            </Row>
          </Row>
        </PageHead>
        <Row gap="sm" wrap>
          <Input aria-label="Search quizzes" placeholder="Search quizzes" value={search} onChange={(event: { target: HTMLInputElement }) => setSearch(event.target.value)} />
          <Select aria-label="Course" value={course} onChange={(event: { target: HTMLSelectElement }) => setCourse(event.target.value)}>
            <option value="">Course: all</option>
            {data.courses.map((held) => (
              <option key={held.id} value={held.id}>
                {held.title}
              </option>
            ))}
            <option value="oneoff">One-off</option>
          </Select>
          <Select aria-label="Created by" value={creator} onChange={(event: { target: HTMLSelectElement }) => setCreator(event.target.value)}>
            <option value="">Created by: anyone</option>
            {creators.map((alias) => (
              <option key={alias} value={alias}>
                @{alias}
              </option>
            ))}
          </Select>
        </Row>
        <div className="qz-scroll" style={{ marginTop: 10, fontSize: 'var(--text-base)' }}>
          <table className="qz-table" style={{ minWidth: 620 }}>
            <thead>
              <tr>
                {header('title', 'Title')}
                {header('course', 'Course')}
                <th>Draws from</th>
                {header('questions', 'Questions', true)}
                {header('created_by', 'Created by')}
                {header('best', 'Your best', true)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
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
                  <td>
                    {row.course ? (
                      <Link className="qz-link" to={pageHref(host, `course/${Q(row.course)}`)} style={{ color: 'var(--color-accent)' }}>
                        {row.course_title} · {row.place}
                      </Link>
                    ) : (
                      <Text tone="faint">One-off</Text>
                    )}
                  </td>
                  <td>{row.draws_from.join(', ') || <Text tone="faint">Nothing yet</Text>}</td>
                  <td className="num">{row.questions}</td>
                  <td>{row.created_by ? <UserPill alias={row.created_by} name={row.created_by_name} /> : <Text tone="faint">Unknown</Text>}</td>
                  <td className="num">{row.best === null ? <Text tone="faint">Not yet</Text> : asPercent(row.best)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <Text tone="muted">{data.quizzes.length === 0 ? 'No quizzes yet. New quiz starts one from your content.' : 'No quizzes match. Clear the search or the filters.'}</Text>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Page>
      {making === 'quiz' && <NewQuiz onClose={() => setMaking(null)} courses={data.courses} draws={[]} course={null} />}
      {making === 'course' && <NewCourse onClose={() => setMaking(null)} />}
    </Surface>
  );
}

// ---- making things -------------------------------------------------------------------------------

export function NewQuiz({ onClose, courses, draws, course: startCourse }: { onClose: () => void; courses: Array<{ id: string; title: string }>; draws: string[]; course: string | null }): JSX.Element {
  const host = usePluginHost();
  const act = useAct();
  const { data: picks } = useData<Pickable>('pickable');
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState(startCourse ?? '');
  const [sources, setSources] = useState<string[]>(draws);
  const [link, setLink] = useState('');
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
            <option value="">None, a one-off</option>
            {courses.map((held) => (
              <option key={held.id} value={held.id}>
                {held.title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <span className="qz-label">Draws from</span>
          <Row gap="xs" wrap>
            {sources.map((source) => (
              <span className="qz-pill" key={source}>
                {source}
                <button aria-label={`Remove ${source}`} onClick={() => setSources(sources.filter((held) => held !== source))}>
                  ×
                </button>
              </span>
            ))}
            <span className="qz-add">
              <Select aria-label="Add blueprint" value="" onChange={(event: { target: HTMLSelectElement }) => event.target.value && setSources([...sources, event.target.value])}>
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
                  setSources([...sources, link.trim()]);
                  setLink('');
                }
              }}
            />
          </Row>
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

function CoursePage({ id }: { id: string }): JSX.Element {
  const host = usePluginHost();
  const act = useAct();
  const { data, error, reload } = useData<CourseView>(`course?id=${Q(id)}`);
  const { data: picks } = useData<Pickable>('pickable');
  const { data: overview } = useData<Overview>('overview');
  const [adding, setAdding] = useState(false);
  useCrumbs(data ? [{ label: 'Quizzes', href: pageHref(host, '') }, { label: data.course.title }] : null);
  if (error) return <Failed message={error} />;
  if (!data) return <Loading />;
  const { course, quizzes, progress } = data;
  const patch = (body: Record<string, unknown>): void => {
    void act('Could not change the course', async () => {
      await host.put(`course?id=${Q(id)}`, body);
      reload();
    });
  };
  const move = (from: number, to: number): void => {
    const ids = quizzes.map((row) => row.id);
    const [held] = ids.splice(from, 1);
    ids.splice(to, 0, held!);
    void act('Could not reorder the course', async () => {
      await host.put(`course/order?id=${Q(id)}`, { ids });
      reload();
    });
  };
  const remove = async (): Promise<void> => {
    if (!(await host.dialog.confirm(`Delete ${course.title}? Its ${quizzes.length} quizzes stay, as one-offs.`, { title: 'Delete course', ok: 'Delete', danger: true }))) return;
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
            <h1 className="qz-h1" style={{ flex: '1 1 400px' }}>
              {course.title}
            </h1>
            {data.may.edit && (
              <>
                <button className="qz-btn secondary" onClick={() => setAdding(true)}>
                  Add quiz
                </button>
                <Button size="sm" variant="quiet" onClick={remove}>
                  Delete
                </Button>
              </>
            )}
          </div>
          {course.description && <p className="qz-muted">{course.description}</p>}
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
            <dd>{course.created_by ? <UserPill alias={course.created_by} name={data.created_by_name} /> : <Text tone="faint">Unknown</Text>}</dd>
          </dl>
          <div className="qz-stats">
            <Stat hero label="Your progress" value={`${progress.taken} of ${progress.of}`} sub="Quizzes taken officially" />
            <Stat label="Your average best" value={asPercent(progress.average_best)} sub="Across quizzes taken" />
            {progress.sessions > 0 && <Stat label="Study plan" value={`${progress.sessions_done} of ${progress.sessions}`} sub="Sessions done" />}
          </div>
          <h2 className="qz-h2">Quizzes, in order</h2>
          {quizzes.length === 0 && <Empty>No quizzes in this course yet. Add quiz starts the first.</Empty>}
          {quizzes.map((row, index) => (
            <div className="qz-card qz-quiz" key={row.id}>
              {data.may.edit && (
                <span className="qz-move">
                  <button aria-label={`Move ${row.title} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>
                    ▲
                  </button>
                  <button aria-label={`Move ${row.title} down`} disabled={index === quizzes.length - 1} onClick={() => move(index, index + 1)}>
                    ▼
                  </button>
                </span>
              )}
              <span className="qz-badge accent">{index + 1}</span>
              <span style={{ flex: '1 1 240px', minWidth: 0 }}>
                <Link to={pageHref(host, `quiz/${Q(row.id)}`)} style={{ display: 'block', fontWeight: 600 }}>
                  {row.title}
                </Link>
                <span className="qz-muted qz-small">
                  {row.questions} questions{row.draws_from.length > 0 ? `, draws from ${row.draws_from.join(' and ')}` : ''}
                </span>
              </span>
              <span className="qz-badge">{row.best === null ? 'Not yet' : `Best ${asPercent(row.best)}`}</span>
              {row.status === 'closed' ? (
                <span className="qz-badge">Closed</span>
              ) : (
                <Link className={`qz-btn${row.best === null ? '' : ' secondary'}`} to={pageHref(host, `quiz/${Q(row.id)}`)}>
                  {row.best === null ? 'Take' : 'Retake'}
                </Link>
              )}
            </div>
          ))}
          <p className="qz-muted qz-small">The order suggests a path. Anyone can take any quiz at any time.</p>
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
        </div>
      </Page>
      {adding && <NewQuiz onClose={() => setAdding(false)} courses={overview?.courses ?? [{ id: course.id, title: course.title }]} draws={[]} course={course.id} />}
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
          <Notice>Press Generate questions to have your agent write them in Chat. They appear here as it adds them. The quiz stays closed until you open it.</Notice>
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

function SourceEditor({ id, reload }: { id: string; reload: () => void }): JSX.Element {
  const host = usePluginHost();
  const act = useAct();
  const { data } = useData<{ text: string }>(`source?id=${Q(id)}`);
  const [text, setText] = useState<string | null>(null);
  const value = text ?? data?.text ?? '';
  return (
    <div style={{ marginTop: 14 }}>
      <Textarea
        aria-label="The quiz's file"
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
              const ok = await act('Could not save the file', () => host.put(`source?id=${Q(id)}`, { text: value }));
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
  useCrumbs(
    data
      ? [
          { label: 'Quizzes', href: pageHref(host, '') },
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
            {may.manage && (
              <Button size="sm" variant="quiet" onClick={remove}>
                Delete
              </Button>
            )}
          </div>
          <dl className="qz-props">
            {may.edit && (
              <>
                <dt>Course</dt>
                <dd>
                  <Select aria-label="Course" value={quiz.course ?? ''} onChange={(event: { target: HTMLSelectElement }) => patch({ course: event.target.value || null })}>
                    <option value="">None, a one-off</option>
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
  useCrumbs(
    data
      ? [{ label: 'Quizzes', href: pageHref(host, '') }, { label: data.quiz.id, mono: true, href: pageHref(host, `quiz/${Q(id)}`) }, { label: kind === 'official' ? 'Official attempt' : 'Practice' }]
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

// ---- beside a blueprint --------------------------------------------------------------------------------------------

function BesideBlueprint(): JSX.Element {
  const host = usePluginHost();
  const act = useAct();
  const open = useOpen() as { kind?: string; id?: string };
  const id = open.kind === 'blueprint' ? (open.id ?? null) : null;
  const { data, reload } = useData<{ quizzes: Row_[]; plan: { course: string; place: number; of: number; sessions_done: number; done: boolean } | null }>(id ? `blueprint?id=${Q(id)}` : null);
  const { data: overview } = useData<Overview>('overview');
  const [making, setMaking] = useState(false);
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
          {data?.quizzes.length === 0 && (
            <Text tone="muted" size="sm" block>
              No quizzes on this yet.
            </Text>
          )}
          <div>
            <Button size="sm" variant="quiet" disabled={!id} onClick={() => setMaking(true)}>
              + New quiz from this
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
      {making && id && <NewQuiz onClose={() => setMaking(false)} courses={overview?.courses ?? []} draws={[id]} course={null} />}
    </Surface>
  );
}

// ---- the page half --------------------------------------------------------------------------------------------------

function Route({ segments, query }: { segments: string[]; query: URLSearchParams }): JSX.Element {
  const [kind, id, tab] = segments.map((segment) => decodeURIComponent(segment));
  if (kind === 'course' && id) return <CoursePage key={id} id={id} />;
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
  name: 'quizzes',
  views: [
    { sector: 'primary', name: 'main', title: 'Quizzes', icon: QuizIcon, render: () => <Sidebar /> },
    { sector: 'auxiliary', name: 'beside', title: 'Quizzes', icon: QuizIcon, render: () => <BesideBlueprint />, when: (open: { kind?: string }) => open.kind === 'blueprint' },
  ],
  pages: [{ path: '', render: (route: { segments: string[]; query: URLSearchParams }) => <Route segments={route.segments} query={route.query} /> }],
  slashCommands: [
    {
      name: 'quiz',
      description: 'Generate a quiz from what is open, or from what you name',
      run: (chat: { args: string; open: { kind?: string; id?: string }; send: (text: string) => void }) => {
        const about = chat.args || (chat.open.kind === 'blueprint' && chat.open.id ? `the blueprint ${chat.open.id}` : 'ask me what it should cover');
        chat.send(
          `Generate a multiple-choice quiz on ${about}. Run \`eidos instructions quizzes\` first and follow what it says about writing questions. Start it with \`eidos quizzes new\`, naming what it draws from, and ask me which course it belongs in if the project has any.`,
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
