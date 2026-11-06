// The plugin's files: quizzes and courses in its own folder, official attempts in its
// workspace, and practice attempts in its local folder. Every write of a file others see
// goes through the host's one write path; a practice attempt is this machine's alone.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { HostError, type Host } from 'eidosmd/plugin';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { drawId, parseAttempt, parseCourse, parseQuiz, renderAttempt, renderCourse, renderQuiz, slugify, type Attempt, type Course, type Person, type Question, type Quiz } from './model.ts';

export const COURSE_FILE = 'course.md';

export interface ProjectPerson extends Person {
  name: string;
  email?: string | null;
  agent: boolean;
}

export interface Listed {
  quizzes: Quiz[];
  courses: Course[];
  // a file of the plugin's folder that would not read, and why
  problems: Array<{ path: string; message: string }>;
}

function posix(file: string): string {
  return file.split(path.sep).join('/');
}

function listDir(folder: string): string[] {
  try {
    return readdirSync(folder).sort();
  } catch {
    return [];
  }
}

export class Store {
  constructor(private readonly host: Host) {}

  get root(): string {
    return this.host.context().root;
  }

  // the folder the framework declares as the plugin's, whatever the owner named it
  folderName(): string {
    const declared = this.host.context().framework.folders.find((folder) => folder.ownedBy === '@quizzes/quizzes');
    return declared?.name ?? 'quizzes';
  }

  private abs(rel: string): string {
    return path.join(this.root, rel);
  }

  private get workspaceRel(): string {
    return posix(path.relative(this.root, this.host.workspace));
  }

  // ---- reading ------------------------------------------------------------------

  list(): Listed {
    const quizzes: Quiz[] = [];
    const courses: Course[] = [];
    const problems: Listed['problems'] = [];
    const folder = this.folderName();
    const readQuiz = (rel: string, course: string | null): void => {
      try {
        quizzes.push(parseQuiz(readFileSync(this.abs(rel), 'utf8'), rel, course));
      } catch (cause) {
        problems.push({ path: rel, message: `this quiz does not read: ${cause instanceof Error ? cause.message : String(cause)}` });
      }
    };
    for (const name of listDir(this.abs(folder))) {
      const rel = `${folder}/${name}`;
      if (name.startsWith('.')) continue;
      const stats = statSync(this.abs(rel));
      if (stats.isFile()) {
        if (name.endsWith('.md')) readQuiz(rel, null);
        continue;
      }
      if (!stats.isDirectory()) continue;
      let course: Course | null = null;
      if (existsSync(this.abs(`${rel}/${COURSE_FILE}`))) {
        try {
          course = parseCourse(readFileSync(this.abs(`${rel}/${COURSE_FILE}`), 'utf8'), `${rel}/${COURSE_FILE}`);
          courses.push(course);
        } catch (cause) {
          problems.push({ path: `${rel}/${COURSE_FILE}`, message: `this course does not read: ${cause instanceof Error ? cause.message : String(cause)}` });
        }
      } else {
        problems.push({ path: rel, message: `this folder has no ${COURSE_FILE}, so its quizzes are in no course` });
      }
      for (const inner of listDir(this.abs(rel))) {
        if (inner === COURSE_FILE || !inner.endsWith('.md')) continue;
        readQuiz(`${rel}/${inner}`, course?.id ?? null);
      }
    }
    quizzes.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
    courses.sort((a, b) => a.title.localeCompare(b.title));
    return { quizzes, courses, problems };
  }

  quiz(id: string): Quiz {
    const found = this.list().quizzes.find((quiz) => quiz.id.toLowerCase() === id.toLowerCase());
    if (!found) throw new HostError(404, `no quiz ${id}; eidos quizzes list shows them`);
    return found;
  }

  course(id: string): Course {
    const found = this.list().courses.find((course) => course.id.toLowerCase() === id.toLowerCase());
    if (!found) throw new HostError(404, `no course ${id}; eidos quizzes course list shows them`);
    return found;
  }

  // ---- people -------------------------------------------------------------------

  // The host hands a plugin the user this machine acts as, not the list of them, so the
  // list is read from the file `eidos users` keeps.
  people(): ProjectPerson[] {
    try {
      const settings = parseYaml(readFileSync(this.abs('.eidos/plugins/eidosmd/settings.yaml'), 'utf8')) as { users?: Array<Record<string, unknown>> } | null;
      return (settings?.users ?? []).map((user) => ({
        name: String(user['name'] ?? ''),
        email: typeof user['email'] === 'string' ? user['email'] : null,
        alias: typeof user['alias'] === 'string' && user['alias'] !== '' ? user['alias'] : null,
        owner: user['owner'] === true,
        agent: user['agent'] === true,
      }));
    } catch {
      return [];
    }
  }

  gitIdentity(): { name: string; email: string | null } | null {
    const read = (key: string): string | null => {
      const run = spawnSync('git', ['config', key], { cwd: this.root, encoding: 'utf8' });
      return run.status === 0 ? run.stdout.trim() || null : null;
    };
    const name = read('user.name');
    return name ? { name, email: read('user.email') } : null;
  }

  // Who a command or the page acts for, as the core signs a comment: the user a process
  // names (never the page's, since the server's environment is not the person at the page),
  // else the one this machine acts as, else the git identity matched to a listed user.
  me(): ProjectPerson | null {
    const people = this.people();
    const find = (key: string): ProjectPerson | null => people.find((person) => person.alias === key || person.name === key) ?? null;
    if (!this.host.serving) {
      const named = process.env['EIDOS_USER']?.trim();
      if (named) return find(named);
    }
    const acting = this.host.actingUser();
    if (acting) {
      const listed = (acting.alias && find(acting.alias)) || find(acting.name);
      if (listed) return listed;
    }
    const identity = this.gitIdentity();
    if (!identity) return null;
    return people.find((person) => (identity.email !== null && person.email === identity.email) || person.name === identity.name) ?? null;
  }

  // Who signs an official attempt: the person acting, added to the project's users the
  // first time they need to be (Quizzes REQ18).
  signer(): ProjectPerson {
    const me = this.me();
    if (me) {
      if (me.agent) throw new HostError(403, 'only people take quizzes, so an agent has no official attempts');
      if (me.alias) return me;
    }
    const identity = this.gitIdentity();
    if (!identity) throw new HostError(400, 'Eidos does not know who you are yet: add yourself with eidos users add, or set your git name');
    const { user } = this.host.addPerson({ name: identity.name, email: identity.email });
    if (!user.alias) throw new HostError(400, `${user.name} has no alias to sign an attempt with; give them one in the project's users`);
    return { name: user.name, alias: user.alias, owner: user.owner === true, agent: false };
  }

  // ---- writing quizzes and courses ---------------------------------------------

  private freePath(folder: string, title: string, except: string | null = null): string {
    const stem = slugify(title);
    for (let turn = 1; ; turn += 1) {
      const rel = `${folder}/${stem}${turn === 1 ? '' : `-${turn}`}.md`;
      if (rel === except || !existsSync(this.abs(rel))) return rel;
    }
  }

  async saveQuiz(quiz: Quiz): Promise<void> {
    mkdirSync(path.dirname(this.abs(quiz.path)), { recursive: true });
    await this.host.writeFile(quiz.path, renderQuiz(quiz));
  }

  private courseFolder(courseId: string | null): string {
    if (courseId === null) return this.folderName();
    return path.posix.dirname(this.course(courseId).path);
  }

  private nextRank(courseId: string | null): number {
    const quizzes = this.list().quizzes.filter((quiz) => quiz.course === courseId && quiz.rank !== Number.MAX_SAFE_INTEGER);
    return Math.max(0, ...quizzes.map((quiz) => quiz.rank)) + 1;
  }

  async createQuiz(input: { title: string; draws_from?: string[]; course?: string | null; created_by?: string | null; rank?: number | null }): Promise<Quiz> {
    const title = input.title.trim();
    if (!title) throw new HostError(400, 'a quiz needs a title');
    const listed = this.list();
    const course = input.course ?? null;
    const quiz: Quiz = {
      id: drawId(
        'Q-',
        listed.quizzes.map((held) => held.id),
      ),
      title,
      draws_from: input.draws_from ?? [],
      created_by: input.created_by === undefined ? (this.me()?.alias ?? null) : input.created_by,
      results_proctors: [],
      rank: this.nextRank(course),
      course,
      questions: [],
      path: this.freePath(this.courseFolder(course), title),
    };
    await this.saveQuiz(quiz);
    if (input.rank !== undefined && input.rank !== null && course !== null) await this.place(quiz.id, input.rank);
    return this.quiz(quiz.id);
  }

  // Moving a quiz moves its file; its id and its results stay (Quizzes REQ25).
  async moveQuiz(id: string, course: string | null): Promise<Quiz> {
    const quiz = this.quiz(id);
    if (quiz.course === course) return quiz;
    const moved: Quiz = { ...quiz, course, rank: this.nextRank(course), path: this.freePath(this.courseFolder(course), quiz.title) };
    renameSync(this.abs(quiz.path), this.abs(moved.path));
    await this.saveQuiz(moved);
    return moved;
  }

  // Puts a quiz at a 1-based place in its course, renumbering the course's ranks so a
  // reorder never renames a file.
  async place(id: string, place: number): Promise<void> {
    const quiz = this.quiz(id);
    const inCourse = this.list().quizzes.filter((held) => held.course === quiz.course && held.id !== quiz.id);
    const at = Math.max(0, Math.min(inCourse.length, Math.floor(place) - 1));
    inCourse.splice(at, 0, quiz);
    await this.writeOrder(inCourse);
  }

  async reorder(course: string, ids: string[]): Promise<void> {
    const inCourse = this.list().quizzes.filter((quiz) => quiz.course === course);
    const byId = new Map(inCourse.map((quiz) => [quiz.id, quiz]));
    const ordered = ids.flatMap((id) => byId.get(id) ?? []);
    await this.writeOrder([...ordered, ...inCourse.filter((quiz) => !ids.includes(quiz.id))]);
  }

  private async writeOrder(quizzes: Quiz[]): Promise<void> {
    for (const [index, quiz] of quizzes.entries()) {
      if (quiz.rank !== index + 1) await this.saveQuiz({ ...quiz, rank: index + 1 });
    }
  }

  removeQuiz(id: string): Quiz {
    const quiz = this.quiz(id);
    rmSync(this.abs(quiz.path));
    return quiz;
  }

  async createCourse(input: { title: string; description?: string; created_by?: string | null; content?: string[]; study_plan?: string[] }): Promise<Course> {
    const title = input.title.trim();
    if (!title) throw new HostError(400, 'a course needs a title');
    const listed = this.list();
    const stem = slugify(title);
    let folder = `${this.folderName()}/${stem}`;
    for (let turn = 2; existsSync(this.abs(folder)); turn += 1) folder = `${this.folderName()}/${stem}-${turn}`;
    const course: Course = {
      id: drawId(
        'C-',
        listed.courses.map((held) => held.id),
      ),
      title,
      description: input.description ?? '',
      created_by: input.created_by === undefined ? (this.me()?.alias ?? null) : input.created_by,
      content: input.content ?? [],
      study_plan: input.study_plan ?? [],
      path: `${folder}/${COURSE_FILE}`,
    };
    mkdirSync(this.abs(folder), { recursive: true });
    await this.host.writeFile(course.path, renderCourse(course));
    return course;
  }

  async saveCourse(course: Course): Promise<void> {
    await this.host.writeFile(course.path, renderCourse(course));
  }

  // A course goes and its quizzes stay, as one-offs (Quizzes REQ28).
  async removeCourse(id: string): Promise<{ course: Course; quizzes: number }> {
    const course = this.course(id);
    const quizzes = this.list().quizzes.filter((quiz) => quiz.course === course.id);
    for (const quiz of quizzes) await this.moveQuiz(quiz.id, null);
    rmSync(this.abs(path.posix.dirname(course.path)), { recursive: true });
    return { course, quizzes: quizzes.length };
  }

  // ---- questions ------------------------------------------------------------------

  newQuestionId(quiz: Quiz): string {
    return drawId(
      'q-',
      quiz.questions.map((question) => question.id),
    ).toLowerCase();
  }

  blankQuestion(quiz: Quiz): Question {
    return { id: this.newQuestionId(quiz), prompt: '', options: ['', ''], answer: null, why: '', reference: '' };
  }

  // ---- attempts --------------------------------------------------------------------

  private attemptsIn(folder: string): Attempt[] {
    const attempts: Attempt[] = [];
    for (const person of listDir(folder)) {
      const held = path.join(folder, person);
      if (!statSync(held).isDirectory()) continue;
      for (const name of listDir(held)) {
        if (!name.endsWith('.yaml') || name === 'sessions.yaml') continue;
        try {
          attempts.push(parseAttempt(readFileSync(path.join(held, name), 'utf8')));
        } catch {
          // a file that does not read is reported by the check, and left out of every sum
        }
      }
    }
    return attempts;
  }

  // official attempts, everyone's
  officialAttempts(quiz?: string): Attempt[] {
    const attempts = this.attemptsIn(path.join(this.host.workspace, 'results'));
    return quiz ? attempts.filter((attempt) => attempt.quiz === quiz) : attempts;
  }

  // practice attempts, this machine's
  practiceAttempts(quiz?: string): Attempt[] {
    const attempts = this.attemptsIn(path.join(this.host.workspace, 'local', 'results'));
    return quiz ? attempts.filter((attempt) => attempt.quiz === quiz) : attempts;
  }

  newAttemptId(): string {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14);
    return drawId(`a-${stamp}-`).toLowerCase();
  }

  async saveAttempt(attempt: Attempt): Promise<void> {
    if (attempt.kind === 'official') {
      await this.host.writeFile(`${this.workspaceRel}/results/${attempt.by}/${attempt.id}.yaml`, renderAttempt(attempt));
      return;
    }
    const folder = path.join(this.host.workspace, 'local', 'results', attempt.by);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, `${attempt.id}.yaml`), renderAttempt(attempt));
  }

  // ---- study sessions ----------------------------------------------------------------

  sessionsDone(alias: string): Record<string, string> {
    try {
      const held = parseYaml(readFileSync(path.join(this.host.workspace, 'results', alias, 'sessions.yaml'), 'utf8')) as { done?: Record<string, string> } | null;
      return held?.done ?? {};
    } catch {
      return {};
    }
  }

  async setSessionDone(alias: string, blueprint: string, done: boolean): Promise<void> {
    const held = this.sessionsDone(alias);
    if (done) held[blueprint] = new Date().toISOString().slice(0, 10);
    else delete held[blueprint];
    await this.host.writeFile(`${this.workspaceRel}/results/${alias}/sessions.yaml`, stringifyYaml({ done: held }));
  }

  // The blueprints a course's link names: one by id, or a collection's or a category's.
  blueprintsOf(links: string[]): Array<{ id: string; title: string; rel: string }> {
    const found = new Map<string, { id: string; title: string; rel: string }>();
    for (const blueprint of this.host.context().blueprints) {
      const id = blueprint.properties?.['id'];
      if (typeof id !== 'string') continue;
      const collection = blueprint.collection.name;
      const category = blueprint.group ? `${collection}/${blueprint.group}` : null;
      if (links.some((link) => link === id || link === collection || link === category)) {
        const title = blueprint.properties?.['title'];
        found.set(id, { id, title: typeof title === 'string' ? title : id, rel: blueprint.rel });
      }
    }
    return [...found.values()].sort((a, b) => a.rel.localeCompare(b.rel));
  }
}
