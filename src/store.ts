// The plugin's files: quizzes, decks, and courses in its own folder; official attempts and
// a signed-in person's study sessions in its workspace; practice attempts and the study
// sessions of nobody in particular in its local folder. Every write of a file others see goes
// through the host's one write path; what is in the local folder is this machine's alone.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { referenceLink } from './question.ts';
import { GUEST_FOLDER, guestAttempt, guestCopy, KEY_FOLDER, shareKey } from './share.ts';
import { HostError, type Host } from 'eidosmd/plugin';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  accessOf,
  applyGrades,
  blankQuestion,
  CARDS_A_SESSION,
  drawId,
  askable,
  isDeckSource,
  parseAttempt,
  parseCourse,
  parseGrade,
  parseDeck,
  parseQuiz,
  parseReview,
  renderAttempt,
  renderCourse,
  renderDeck,
  renderGrade,
  renderQuiz,
  renderReview,
  slugify,
  type Attempt,
  type Card,
  type Course,
  type Deck,
  type Grade,
  type Person,
  type Question,
  type Quiz,
  type Review,
} from './model.ts';

export const COURSE_FILE = 'course.md';
const ENROLLMENTS_FILE = 'enrollments.yaml';
// a person's study sessions, one file each, beside their attempts
const REVIEWS_FOLDER = 'reviews';
const GRADES_FOLDER = 'grades';
// what the Quizzes plugin, Academy's name before 0.3.0, kept its files under
export const QUIZZES_OWNER = '@quizzes/quizzes';
const QUIZZES_WORKSPACE = '.eidos/plugins/quizzes';
// who a practice attempt is by while no user is selected
export const LOCAL_PERSON = 'local';

export interface ProjectPerson extends Person {
  name: string;
  email?: string | null;
  agent: boolean;
}

export interface Listed {
  quizzes: Quiz[];
  decks: Deck[];
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

export type Placed = { kind: 'quiz'; item: Quiz } | { kind: 'deck'; item: Deck };

export class Store {
  constructor(private readonly host: Host) {}

  get root(): string {
    return this.host.context().root;
  }

  // the folder the framework declares as the plugin's, whatever the owner named it
  folderName(): string {
    const declared = this.host.context().framework.folders.find((folder) => folder.ownedBy === '@academy/academy');
    return declared?.name ?? 'academy';
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
    const decks: Deck[] = [];
    const courses: Course[] = [];
    const problems: Listed['problems'] = [];
    const folder = this.folderName();
    const readQuiz = (rel: string, course: string | null): void => {
      let source = '';
      try {
        source = readFileSync(this.abs(rel), 'utf8');
        if (isDeckSource(source)) decks.push(parseDeck(source, rel, course));
        else quizzes.push(parseQuiz(source, rel, course));
      } catch (cause) {
        problems.push({ path: rel, message: `this ${isDeckSource(source) ? 'deck' : 'quiz'} does not read: ${cause instanceof Error ? cause.message : String(cause)}` });
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
        problems.push({ path: rel, message: `this folder has no ${COURSE_FILE}, so its quizzes and decks are in no course` });
      }
      for (const inner of listDir(this.abs(rel))) {
        if (inner === COURSE_FILE || !inner.endsWith('.md')) continue;
        readQuiz(`${rel}/${inner}`, course?.id ?? null);
      }
    }
    const byRank = (a: { rank: number; title: string }, b: { rank: number; title: string }): number => a.rank - b.rank || a.title.localeCompare(b.title);
    quizzes.sort(byRank);
    decks.sort(byRank);
    courses.sort((a, b) => a.title.localeCompare(b.title));
    return { quizzes, decks, courses, problems };
  }

  quiz(id: string): Quiz {
    const found = this.list().quizzes.find((quiz) => quiz.id.toLowerCase() === id.toLowerCase());
    if (!found) throw new HostError(404, `no quiz ${id}; eidos academy list shows them`);
    return found;
  }

  deck(id: string): Deck {
    const found = this.list().decks.find((deck) => deck.id.toLowerCase() === id.toLowerCase());
    if (!found) throw new HostError(404, `no deck ${id}; eidos academy list shows them`);
    return found;
  }

  course(id: string): Course {
    const found = this.list().courses.find((course) => course.id.toLowerCase() === id.toLowerCase());
    if (!found) throw new HostError(404, `no course ${id}; eidos academy course list shows them`);
    return found;
  }

  // A course's quizzes and decks in its order, which the two share.
  inCourse(course: string | null): Placed[] {
    const listed = this.list();
    return [...listed.quizzes.map((quiz) => ({ kind: 'quiz' as const, item: quiz })), ...listed.decks.map((deck) => ({ kind: 'deck' as const, item: deck }))]
      .filter((placed) => placed.item.course === course)
      .sort((a, b) => a.item.rank - b.item.rank || a.item.title.localeCompare(b.item.title));
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

  // Who someone counts as for what the page shows and who may change a thing (Academy REQ23).
  access(): Person {
    return accessOf(
      this.me(),
      this.people().some((person) => person.owner),
    );
  }

  // Why this person can't sign an official attempt or an enrollment, or null when they can.
  cannotSign(what: 'An official attempt' | 'Enrolling' | 'Grading' = 'An official attempt'): string | null {
    const me = this.me();
    if (me?.agent) return what === 'Enrolling' ? 'Only people enroll in a course' : 'Only people take quizzes';
    if (me?.alias || this.gitIdentity()) return null;
    return `${what} needs a name: pick who you are in the project, or set your git name`;
  }

  // Who signs an official attempt or an enrollment: the person acting, added to the project's
  // users the first time they need to be (Academy REQ18).
  signer(what: 'An official attempt' | 'Enrolling' | 'Grading' = 'An official attempt'): ProjectPerson {
    const me = this.me();
    if (me) {
      if (me.agent) throw new HostError(403, what === 'Enrolling' ? 'only people enroll in a course, so an agent has no progress' : 'only people take quizzes, so an agent has no official attempts');
      if (me.alias) return me;
    }
    const identity = this.gitIdentity();
    if (!identity) throw new HostError(400, `${what.toLowerCase()} needs a name: pick who you are in the project, or set your git name`);
    const { user } = this.host.addPerson({ name: identity.name, email: identity.email });
    if (!user.alias) throw new HostError(400, `${user.name} has no alias to sign an attempt with; give them one in the project's users`);
    return { name: user.name, alias: user.alias, owner: user.owner === true, agent: false };
  }

  // Whose a practice attempt is. It stays on this machine, so it needs no name to be kept.
  practiceBy(): string {
    const me = this.me();
    if (me?.agent) throw new HostError(403, 'only people take quizzes, so an agent has no attempts');
    return me?.alias ?? LOCAL_PERSON;
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
    // a quiz shared by a public link: its link follows it (Academy REQ68)
    if (existsSync(this.abs(this.sharePaths(quiz.id).guest))) await this.writeShare(this.quiz(quiz.id));
  }

  // ---- a quiz's public link (Academy REQ68) ------------------------------------------------

  sharePaths(quizId: string): { guest: string; key: string } {
    return { guest: `${this.workspaceRel}/${GUEST_FOLDER}/${quizId}.json`, key: `${this.workspaceRel}/${KEY_FOLDER}/${quizId}.json` };
  }

  // The guest copy and the key, written as the quiz stands; each only when it changed, so a link is told of a real change.
  async writeShare(quiz: Quiz): Promise<{ guest: string; key: string }> {
    const paths = this.sharePaths(quiz.id);
    const course = quiz.course ? (this.list().courses.find((held) => held.id === quiz.course)?.title ?? null) : null;
    const titles = new Map(
      this.sectionsOf(quiz.questions.map((question) => referenceLink(question.reference)).flatMap((link) => (link?.kind === 'blueprint' ? [link.id] : []))).map((held) => [held.id, held.title]),
    );
    const asked = askable(quiz);
    const files: Array<[string, unknown]> = [
      [paths.guest, guestCopy(quiz, asked, course)],
      [paths.key, shareKey(asked, (id) => titles.get(id) ?? null)],
    ];
    for (const [rel, value] of files) {
      const text = `${JSON.stringify(value, null, 2)}\n`;
      if (existsSync(this.abs(rel)) && readFileSync(this.abs(rel), 'utf8') === text) continue;
      mkdirSync(path.dirname(this.abs(rel)), { recursive: true });
      await this.host.writeFile(rel, text);
    }
    return paths;
  }

  // The quiz a file of the plugin's folder holds, or null for a deck, a course, or anything else.
  quizAt(rel: string): Quiz | null {
    if (!rel.endsWith('.md') || !rel.startsWith(`${this.folderName()}/`) || path.posix.basename(rel) === COURSE_FILE || !existsSync(this.abs(rel))) return null;
    try {
      const source = readFileSync(this.abs(rel), 'utf8');
      return isDeckSource(source) ? null : this.quiz(parseQuiz(source, rel, null).id);
    } catch {
      return null;
    }
  }

  private courseFolder(courseId: string | null): string {
    if (courseId === null) return this.folderName();
    return path.posix.dirname(this.course(courseId).path);
  }

  private nextRank(courseId: string | null): number {
    const ranked = this.inCourse(courseId).filter((placed) => placed.item.rank !== Number.MAX_SAFE_INTEGER);
    return Math.max(0, ...ranked.map((placed) => placed.item.rank)) + 1;
  }

  async createQuiz(input: { closed?: boolean; title: string; draws_from?: string[]; course?: string | null; created_by?: string | null; rank?: number | null }): Promise<Quiz> {
    const title = input.title.trim();
    if (!title) throw new HostError(400, 'a quiz needs a title');
    const listed = this.list();
    const course = input.course ?? null;
    const quiz: Quiz = {
      id: drawId(
        'Q-',
        [...listed.quizzes, ...listed.decks].map((held) => held.id),
      ),
      title,
      draws_from: input.draws_from ?? [],
      created_by: input.created_by === undefined ? (this.me()?.alias ?? null) : input.created_by,
      proctors: [],
      // nothing to ask yet, whatever the file comes to say
      status: 'closed',
      closed: input.closed ?? false,
      rank: this.nextRank(course),
      course,
      shuffle_questions: true,
      shuffle_options: true,
      guest_name: 'required',
      questions: [],
      path: this.freePath(this.courseFolder(course), title),
    };
    await this.saveQuiz(quiz);
    if (input.rank !== undefined && input.rank !== null && course !== null) await this.place(quiz.id, input.rank);
    return this.quiz(quiz.id);
  }

  // Moving a quiz moves its file; its id and its results stay (Academy REQ25).
  async moveQuiz(id: string, course: string | null): Promise<Quiz> {
    const quiz = this.quiz(id);
    if (quiz.course === course) return quiz;
    const moved: Quiz = { ...quiz, course, rank: this.nextRank(course), path: this.freePath(this.courseFolder(course), quiz.title) };
    renameSync(this.abs(quiz.path), this.abs(moved.path));
    await this.saveQuiz(moved);
    return moved;
  }

  // Puts a quiz or a deck at a 1-based place in its course, renumbering the course's ranks
  // so a reorder never renames a file.
  async place(id: string, place: number): Promise<void> {
    const placed = this.placed(id);
    const others = this.inCourse(placed.item.course).filter((held) => held.item.id !== placed.item.id);
    const at = Math.max(0, Math.min(others.length, Math.floor(place) - 1));
    others.splice(at, 0, placed);
    await this.writeOrder(others);
  }

  async reorder(course: string, ids: string[]): Promise<void> {
    const inCourse = this.inCourse(course);
    const byId = new Map(inCourse.map((placed) => [placed.item.id, placed]));
    const ordered = ids.flatMap((id) => byId.get(id) ?? []);
    await this.writeOrder([...ordered, ...inCourse.filter((placed) => !ids.includes(placed.item.id))]);
  }

  private placed(id: string): Placed {
    const quiz = this.list().quizzes.find((held) => held.id.toLowerCase() === id.toLowerCase());
    return quiz ? { kind: 'quiz', item: quiz } : { kind: 'deck', item: this.deck(id) };
  }

  private async writeOrder(items: Placed[]): Promise<void> {
    for (const [index, placed] of items.entries()) {
      if (placed.item.rank === index + 1) continue;
      if (placed.kind === 'quiz') await this.saveQuiz({ ...placed.item, rank: index + 1 });
      else await this.saveDeck({ ...placed.item, rank: index + 1 });
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

  // A course goes and its quizzes and decks stay, as one-offs (Academy REQ28).
  async removeCourse(id: string): Promise<{ course: Course; quizzes: number; decks: number }> {
    const course = this.course(id);
    const listed = this.list();
    const quizzes = listed.quizzes.filter((quiz) => quiz.course === course.id);
    const decks = listed.decks.filter((deck) => deck.course === course.id);
    for (const quiz of quizzes) await this.moveQuiz(quiz.id, null);
    for (const deck of decks) await this.moveDeck(deck.id, null);
    rmSync(this.abs(path.posix.dirname(course.path)), { recursive: true });
    return { course, quizzes: quizzes.length, decks: decks.length };
  }

  // ---- decks and their cards ------------------------------------------------------

  async saveDeck(deck: Deck): Promise<void> {
    mkdirSync(path.dirname(this.abs(deck.path)), { recursive: true });
    await this.host.writeFile(deck.path, renderDeck(deck));
  }

  async createDeck(input: {
    closed?: boolean;
    title: string;
    draws_from?: string[];
    course?: string | null;
    created_by?: string | null;
    rank?: number | null;
    made_from?: string | null;
    cards?: Card[];
  }): Promise<Deck> {
    const title = input.title.trim();
    if (!title) throw new HostError(400, 'a deck needs a title');
    const listed = this.list();
    const course = input.course ?? null;
    const deck: Deck = {
      id: drawId(
        'F-',
        [...listed.quizzes, ...listed.decks].map((held) => held.id),
      ),
      title,
      draws_from: input.draws_from ?? [],
      made_from: input.made_from ?? null,
      created_by: input.created_by === undefined ? (this.me()?.alias ?? null) : input.created_by,
      proctors: [],
      status: 'closed',
      closed: input.closed ?? false,
      rank: this.nextRank(course),
      course,
      per_session: CARDS_A_SESSION,
      cards: input.cards ?? [],
      path: this.freePath(this.courseFolder(course), title),
    };
    await this.saveDeck(deck);
    if (input.rank !== undefined && input.rank !== null && course !== null) await this.place(deck.id, input.rank);
    return this.deck(deck.id);
  }

  // Moving a deck moves its file; its id and everyone's sessions with it stay.
  async moveDeck(id: string, course: string | null): Promise<Deck> {
    const deck = this.deck(id);
    if (deck.course === course) return deck;
    const moved: Deck = { ...deck, course, rank: this.nextRank(course), path: this.freePath(this.courseFolder(course), deck.title) };
    renameSync(this.abs(deck.path), this.abs(moved.path));
    await this.saveDeck(moved);
    return moved;
  }

  removeDeck(id: string): Deck {
    const deck = this.deck(id);
    rmSync(this.abs(deck.path));
    return deck;
  }

  newCardId(deck: Pick<Deck, 'cards'>, taken: string[] = []): string {
    return drawId('c-', [...deck.cards.map((card) => card.id), ...taken]).toLowerCase();
  }

  blankCard(deck: Deck): Card {
    return { id: this.newCardId(deck), front: '', back: '', reference: '' };
  }

  // ---- questions ------------------------------------------------------------------

  newQuestionId(quiz: Quiz): string {
    return drawId(
      'q-',
      quiz.questions.map((question) => question.id),
    ).toLowerCase();
  }

  blankQuestion(quiz: Quiz, type: Question['type'] = 'choice'): Question {
    return blankQuestion(this.newQuestionId(quiz), type);
  }

  // ---- attempts --------------------------------------------------------------------

  private attemptsIn(folder: string): Attempt[] {
    const attempts: Attempt[] = [];
    for (const person of listDir(folder)) {
      const held = path.join(folder, person);
      if (!statSync(held).isDirectory()) continue;
      for (const name of listDir(held)) {
        if (!name.endsWith('.yaml') || name === 'sessions.yaml' || name === ENROLLMENTS_FILE) continue;
        try {
          attempts.push(parseAttempt(readFileSync(path.join(held, name), 'utf8')));
        } catch {
          // a file that does not read is reported by the check, and left out of every sum
        }
      }
    }
    return attempts;
  }

  // official attempts, everyone's, with every grade given to their written answers
  officialAttempts(quiz?: string): Attempt[] {
    const all = this.attemptsIn(path.join(this.host.workspace, 'results'));
    const attempts = quiz ? all.filter((attempt) => attempt.quiz === quiz) : all;
    if (!attempts.some((attempt) => attempt.answers.some((answer) => answer.question.type === 'written'))) return attempts;
    const grades = this.grades(quiz);
    return attempts.map((attempt) => applyGrades(attempt, grades));
  }

  // Guests' attempts at a quiz from its public links, newest first, with their written answers' grades (Academy REQ72, REQ74).
  // A host before share links has none.
  guestAttempts(quizId: string): Attempt[] {
    if (typeof this.host.submissions !== 'function') return [];
    const quiz = this.quiz(quizId);
    const attempts = this.host.submissions().flatMap((submission) => guestAttempt(submission, quiz) ?? []);
    const grades = attempts.some((attempt) => attempt.answers.some((answer) => answer.question.type === 'written')) ? this.grades(quizId) : [];
    return attempts.map((attempt) => applyGrades(attempt, grades)).sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  }

  // A guest's attempt taken out, or every one that came through one link (REQ73).
  removeGuestAttempts(quizId: string, which: { submission: string } | { link: string }): number {
    let removed = 0;
    for (const attempt of this.guestAttempts(quizId)) {
      const guest = attempt.guest;
      if (!guest || ('link' in which ? guest.link !== which.link : attempt.id !== which.submission)) continue;
      this.host.removeSubmission({ link: guest.link, id: guest.submission });
      removed += 1;
    }
    return removed;
  }

  // ---- grades of written answers (Academy REQ66) -----------------------------------------

  grades(quiz?: string): Grade[] {
    const grades: Grade[] = [];
    const results = path.join(this.host.workspace, 'results');
    for (const person of listDir(results)) {
      const folder = path.join(results, person, GRADES_FOLDER);
      if (!existsSync(folder) || !statSync(folder).isDirectory()) continue;
      for (const name of listDir(folder)) {
        if (!name.endsWith('.yaml')) continue;
        try {
          const grade = parseGrade(readFileSync(path.join(folder, name), 'utf8'));
          if (!quiz || grade.quiz === quiz) grades.push(grade);
        } catch {
          // a file that does not read is left out, as an attempt is
        }
      }
    }
    return grades;
  }

  newGradeId(): string {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14);
    return drawId(`g-${stamp}-`).toLowerCase();
  }

  async saveGrade(grade: Grade): Promise<void> {
    await this.host.writeFile(`${this.workspaceRel}/results/${grade.by}/${GRADES_FOLDER}/${grade.id}.yaml`, renderGrade(grade));
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

  // ---- study sessions with a deck -----------------------------------------------------

  private reviewsIn(folder: string, shared: boolean): Array<Review & { shared: boolean }> {
    const reviews: Array<Review & { shared: boolean }> = [];
    for (const person of listDir(folder)) {
      const held = shared ? path.join(folder, person, REVIEWS_FOLDER) : path.join(folder, person);
      for (const name of listDir(held)) {
        if (!name.endsWith('.yaml')) continue;
        try {
          reviews.push({ ...parseReview(readFileSync(path.join(held, name), 'utf8')), shared });
        } catch {
          // a file that does not read is left out of every sum
        }
      }
    }
    return reviews;
  }

  // A person's sessions with a deck: those committed under their name, and this machine's own
  // under their name or nobody's. Nobody else's are read for anything this person is shown.
  reviewsOf(alias: string | null, deck?: string): Array<Review & { shared: boolean }> {
    const shared = alias ? this.reviewsIn(path.join(this.host.workspace, 'results'), true).filter((review) => review.by === alias) : [];
    const local = this.reviewsIn(path.join(this.host.workspace, 'local', REVIEWS_FOLDER), false).filter((review) => review.by === LOCAL_PERSON || review.by === alias);
    const all = [...shared, ...local];
    return deck ? all.filter((review) => review.deck === deck) : all;
  }

  newReviewId(): string {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14);
    return drawId(`r-${stamp}-`).toLowerCase();
  }

  // Someone signed in keeps their sessions with the project, so where they are in a deck follows
  // them to any machine; with nobody selected, they stay on this one.
  async saveReview(review: Review, shared: boolean): Promise<void> {
    if (shared) {
      await this.host.writeFile(`${this.workspaceRel}/results/${review.by}/${REVIEWS_FOLDER}/${review.id}.yaml`, renderReview(review));
      return;
    }
    const folder = path.join(this.host.workspace, 'local', REVIEWS_FOLDER, review.by);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, `${review.id}.yaml`), renderReview(review));
  }

  // Who a study session is by, and whether it is committed: a person with a name in the
  // project, else nobody in particular on this machine. An agent never studies.
  studier(): { by: string; shared: boolean } {
    const me = this.me();
    if (me?.agent) throw new HostError(403, 'only people study, so an agent has no study sessions');
    return me?.alias ? { by: me.alias, shared: true } : { by: LOCAL_PERSON, shared: false };
  }

  // ---- from the Quizzes plugin ---------------------------------------------------------

  // What Quizzes, this plugin's name before 0.3.0, left in the project: the folder the
  // framework declares as its own, and its workspace's results and practice files.
  quizzesLeft(): { folder: string | null; files: string[]; results: string[] } {
    const declared = this.host.context().framework.folders.find((folder) => folder.ownedBy === QUIZZES_OWNER)?.name ?? null;
    const walk = (rel: string): string[] => {
      const out: string[] = [];
      for (const name of listDir(this.abs(rel))) {
        if (name.startsWith('.')) continue;
        const inner = `${rel}/${name}`;
        if (statSync(this.abs(inner)).isDirectory()) out.push(...walk(inner));
        else out.push(inner);
      }
      return out;
    };
    const files = declared && declared !== this.folderName() ? walk(declared).filter((rel) => rel.endsWith('.md')) : [];
    const results = [...walk(`${QUIZZES_WORKSPACE}/results`), ...walk(`${QUIZZES_WORKSPACE}/local`)];
    return { folder: declared, files, results };
  }

  // Brings everything Quizzes kept into Academy: each quiz and course into Academy's folder,
  // under the same names where they are free, and every result, enrollment, and practice
  // file into Academy's workspace. Ids stay, so every attempt still names its quiz. The old
  // folder's entry in the framework is the framework editor's to take out.
  moveFromQuizzes(): { quizzes: number; courses: number; results: number; folder: string | null } {
    const left = this.quizzesLeft();
    let quizzes = 0;
    let courses = 0;
    const target = this.folderName();
    mkdirSync(this.abs(target), { recursive: true });
    if (left.folder && left.folder !== target) {
      for (const name of listDir(this.abs(left.folder))) {
        if (name.startsWith('.')) continue;
        const from = `${left.folder}/${name}`;
        const isCourse = statSync(this.abs(from)).isDirectory();
        let to = `${target}/${name}`;
        for (let turn = 2; existsSync(this.abs(to)); turn += 1) to = isCourse ? `${target}/${name}-${turn}` : `${target}/${name.replace(/\.md$/, '')}-${turn}.md`;
        renameSync(this.abs(from), this.abs(to));
        if (isCourse) {
          courses += 1;
          quizzes += listDir(this.abs(to)).filter((inner) => inner.endsWith('.md') && inner !== COURSE_FILE).length;
        } else if (name.endsWith('.md')) quizzes += 1;
      }
    }
    let results = 0;
    for (const part of ['results', 'local']) {
      const from = this.abs(`${QUIZZES_WORKSPACE}/${part}`);
      if (!existsSync(from)) continue;
      const moveInto = (source: string, destination: string): void => {
        mkdirSync(destination, { recursive: true });
        for (const name of listDir(source)) {
          const inner = path.join(source, name);
          const outer = path.join(destination, name);
          if (statSync(inner).isDirectory()) moveInto(inner, outer);
          else if (!existsSync(outer)) {
            renameSync(inner, outer);
            results += 1;
          }
        }
        if (listDir(source).length === 0) rmSync(source, { recursive: true });
      };
      moveInto(from, path.join(this.host.workspace, part));
    }
    // the folders the move emptied go too, so the check does not report a folder nobody declares
    const emptied = (rel: string): void => {
      const folder = this.abs(rel);
      if (existsSync(folder) && listDir(folder).every((name) => name.startsWith('.'))) rmSync(folder, { recursive: true });
    };
    if (left.folder && left.folder !== target) emptied(left.folder);
    emptied(QUIZZES_WORKSPACE);
    return { quizzes, courses, results, folder: left.folder && left.folder !== target ? left.folder : null };
  }

  // ---- enrollments -------------------------------------------------------------------

  // A person's own file beside their attempts, so two people enrolling never conflict
  // (Academy REQ41): the courses they are in, each with when they enrolled.
  enrollmentsOf(alias: string): Record<string, string> {
    try {
      const held = parseYaml(readFileSync(path.join(this.host.workspace, 'results', alias, ENROLLMENTS_FILE), 'utf8')) as { courses?: Record<string, string> } | null;
      return held?.courses ?? {};
    } catch {
      return {};
    }
  }

  // Everyone in a course, read from each person's own file.
  enrolledIn(course: string): Array<{ alias: string; since: string }> {
    const folder = path.join(this.host.workspace, 'results');
    return listDir(folder).flatMap((alias) => {
      const since = this.enrollmentsOf(alias)[course];
      return since ? [{ alias, since }] : [];
    });
  }

  async setEnrolled(alias: string, course: string, enrolled: boolean): Promise<void> {
    const held = this.enrollmentsOf(alias);
    if (enrolled === Boolean(held[course])) return;
    if (enrolled) held[course] = new Date().toISOString();
    else delete held[course];
    await this.host.writeFile(`${this.workspaceRel}/results/${alias}/${ENROLLMENTS_FILE}`, stringifyYaml({ courses: held }));
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
  // Blueprints by id, with the headings of their sections, for a question's reference (Academy REQ61).
  sectionsOf(ids: string[]): Array<{ id: string; title: string; rel: string; sections: string[] }> {
    const wanted = new Set(ids);
    const found: Array<{ id: string; title: string; rel: string; sections: string[] }> = [];
    for (const blueprint of this.host.context().blueprints) {
      const id = blueprint.properties?.['id'];
      if (typeof id !== 'string' || !wanted.has(id)) continue;
      const title = blueprint.properties?.['title'];
      found.push({
        id,
        title: typeof title === 'string' ? title : id,
        rel: blueprint.rel,
        sections: blueprint.headings.filter((heading) => heading.level >= 2 && heading.level <= 3).map((heading) => heading.text.trim()),
      });
    }
    return found;
  }

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
