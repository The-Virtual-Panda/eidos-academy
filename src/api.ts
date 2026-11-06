// What the page and the commands both ask of the plugin, and the soft permission over it:
// who is shown what (Quizzes REQ23). The files stay readable by anyone with the project.
import { HostError, type Host } from 'eidosmd/plugin';
import {
  askable,
  canEdit,
  parseQuiz,
  renderQuiz,
  canSeeResults,
  compare,
  everyone,
  makeAttempt,
  myScores,
  percent,
  practiceSets,
  questionProblems,
  type Attempt,
  type AttemptKind,
  type AttemptMode,
  type Course,
  type Question,
  type Quiz,
} from './model.ts';
import { Store, type ProjectPerson } from './store.ts';

export interface QuizRow {
  id: string;
  title: string;
  path: string;
  course: string | null;
  course_title: string | null;
  place: number | null;
  draws_from: string[];
  questions: number;
  created_by: string | null;
  best: number | null;
}

export type Api = ReturnType<typeof makeApi>;

export function makeApi(host: Host) {
  const store = new Store(host);

  const myAttempts = (quiz: string, alias: string | null): Attempt[] => {
    const official = alias ? store.officialAttempts(quiz).filter((attempt) => attempt.by === alias) : [];
    const practice = store.practiceAttempts(quiz).filter((attempt) => alias === null || attempt.by === alias);
    return [...official, ...practice];
  };

  const bestOf = (quiz: string, alias: string | null, official: Attempt[]): number | null => {
    if (!alias) return null;
    const mine = official.filter((attempt) => attempt.quiz === quiz && attempt.by === alias);
    return mine.length > 0 ? Math.max(...mine.map(percent)) : null;
  };

  const rows = (): QuizRow[] => {
    const { quizzes, courses } = store.list();
    const me = store.me();
    const official = store.officialAttempts();
    const seen = new Map<string, number>();
    const inOrder = [...quizzes].sort((a, b) => (courses.find((course) => course.id === a.course)?.title ?? '\uffff').localeCompare(courses.find((course) => course.id === b.course)?.title ?? '\uffff') || a.rank - b.rank || a.title.localeCompare(b.title));
    return inOrder.map((quiz) => {
      const place = quiz.course ? (seen.get(quiz.course) ?? 0) + 1 : null;
      if (quiz.course && place) seen.set(quiz.course, place);
      return {
        id: quiz.id,
        title: quiz.title,
        path: quiz.path,
        course: quiz.course,
        course_title: courses.find((course) => course.id === quiz.course)?.title ?? null,
        place,
        draws_from: quiz.draws_from,
        questions: askable(quiz).length,
        created_by: quiz.created_by,
        best: bestOf(quiz.id, me?.alias ?? null, official),
      };
    });
  };

  const requireEdit = (thing: { created_by: string | null }, what: string): void => {
    if (!canEdit(thing, store.me())) throw new HostError(403, `only ${what}'s creator and the project's owners change it`);
  };

  const validated = (question: Question): Question => {
    const problems = questionProblems(question);
    if (problems.length > 0) throw new HostError(400, `this question can't be saved yet: ${problems.join('; ')}`);
    return question;
  };

  return {
    store,

    me(): ProjectPerson | null {
      return store.me();
    },

    overview() {
      const me = store.me();
      return {
        me: me ? { name: me.name, alias: me.alias, owner: me.owner } : null,
        folder: store.folderName(),
        quizzes: rows(),
        courses: store.list().courses.map((course) => ({ id: course.id, title: course.title, created_by: course.created_by })),
      };
    },

    // A quiz with what this person may see of it. The key comes with it, since taking a quiz
    // says at once whether an answer is right, and the file is readable anyway.
    quiz(id: string) {
      const quiz = store.quiz(id);
      const me = store.me();
      const alias = me?.alias ?? null;
      const mine = myAttempts(quiz.id, alias);
      const listed = store.list();
      const inCourse = quiz.course ? listed.quizzes.filter((held) => held.course === quiz.course) : [];
      const course = listed.courses.find((held) => held.id === quiz.course) ?? null;
      return {
        quiz,
        askable: askable(quiz).length,
        course: course ? { id: course.id, title: course.title } : null,
        place: quiz.course ? inCourse.findIndex((held) => held.id === quiz.id) + 1 : null,
        of: inCourse.length,
        may: { edit: canEdit(quiz, me), results: canSeeResults(quiz, me), take_official: !me?.agent },
        scores: myScores(mine),
        practice: practiceSets(quiz, mine),
        whole_quiz: askable(quiz).map((question) => question.id),
        people: store
          .people()
          .filter((person) => !person.agent && person.alias)
          .map((person) => ({ alias: person.alias!, name: person.name })),
      };
    },

    compare(id: string) {
      const quiz = store.quiz(id);
      return compare(store.officialAttempts(quiz.id), store.me()?.alias ?? null);
    },

    results(id: string) {
      const quiz = store.quiz(id);
      if (!canSeeResults(quiz, store.me())) throw new HostError(403, "a quiz's results are shown to its creator, its results proctors, and the project's owners");
      const official = store.officialAttempts(quiz.id);
      const names = new Map(store.people().map((person) => [person.alias, person.name]));
      const people = everyone(official).map((person) => ({ ...person, name: names.get(person.alias) ?? person.alias }));
      return { summary: compare(official, null), attempts: official.length, first: official.map((attempt) => attempt.completed_at).sort()[0] ?? null, people };
    },

    // One attempt: a person's own, or anyone's for someone who may see the quiz's results.
    attempt(quizId: string, attemptId: string): Attempt {
      const quiz = store.quiz(quizId);
      const me = store.me();
      const own = myAttempts(quiz.id, me?.alias ?? null).find((attempt) => attempt.id === attemptId);
      if (own) return own;
      if (!canSeeResults(quiz, me)) throw new HostError(403, "another person's answers are shown to the quiz's creator, its results proctors, and the project's owners");
      const found = store.officialAttempts(quiz.id).find((attempt) => attempt.id === attemptId);
      if (!found) throw new HostError(404, `no attempt ${attemptId} on this quiz`);
      return found;
    },

    async submit(input: { quiz: string; kind: AttemptKind; mode: AttemptMode; answers: Array<{ question: string; chosen: number }> }) {
      const quiz = store.quiz(input.quiz);
      if (input.kind !== 'official' && input.kind !== 'practice') throw new HostError(400, 'an attempt is official or practice');
      if (input.kind === 'official' && input.mode !== 'whole') throw new HostError(400, 'an official attempt takes the whole quiz');
      const person = store.signer();
      const earlier = store.officialAttempts(quiz.id).filter((attempt) => attempt.by === person.alias);
      let attempt: Attempt;
      try {
        attempt = makeAttempt({ id: store.newAttemptId(), quiz, kind: input.kind, mode: input.mode, by: person.alias!, completedAt: new Date().toISOString(), answers: input.answers });
      } catch (cause) {
        throw new HostError(409, cause instanceof Error ? cause.message : String(cause));
      }
      await store.saveAttempt(attempt);
      const fraction = percent(attempt);
      const last = earlier.sort((a, b) => a.completed_at.localeCompare(b.completed_at)).at(-1);
      const mine = myAttempts(quiz.id, person.alias);
      return {
        attempt,
        percent: fraction,
        first: attempt.kind === 'official' && earlier.length === 0,
        new_best: attempt.kind === 'official' && earlier.length > 0 && fraction > Math.max(...earlier.map(percent)),
        change: last ? fraction - percent(last) : null,
        official_attempts: earlier.length + (attempt.kind === 'official' ? 1 : 0),
        average: compare(store.officialAttempts(quiz.id), null).average,
        practice: practiceSets(quiz, mine),
      };
    },

    // ---- from the page, under the soft permission ----

    async createQuiz(input: { title: string; draws_from?: string[]; course?: string | null; place?: number | null }) {
      if (input.course) requireEdit(store.course(input.course), 'a course');
      return store.createQuiz({ title: input.title, draws_from: input.draws_from ?? [], course: input.course ?? null, rank: input.place ?? null });
    },

    async updateQuiz(id: string, patch: { title?: string; draws_from?: string[]; results_proctors?: string[]; created_by?: string | null; course?: string | null }) {
      let quiz = store.quiz(id);
      requireEdit(quiz, 'a quiz');
      if (patch.course !== undefined) {
        if (patch.course) requireEdit(store.course(patch.course), 'a course');
        quiz = await store.moveQuiz(quiz.id, patch.course);
      }
      const next: Quiz = {
        ...quiz,
        ...(patch.title !== undefined ? { title: patch.title.trim() || quiz.title } : {}),
        ...(patch.draws_from ? { draws_from: patch.draws_from } : {}),
        ...(patch.results_proctors ? { results_proctors: patch.results_proctors } : {}),
        ...(patch.created_by !== undefined ? { created_by: patch.created_by } : {}),
      };
      await store.saveQuiz(next);
      return next;
    },

    async saveQuestion(id: string, question: Question) {
      const quiz = store.quiz(id);
      requireEdit(quiz, 'a quiz');
      validated(question);
      const at = quiz.questions.findIndex((held) => held.id === question.id);
      const questions = [...quiz.questions];
      if (at >= 0) questions[at] = question;
      else questions.push(question);
      await store.saveQuiz({ ...quiz, questions });
      return store.quiz(id);
    },

    async removeQuestion(id: string, questionId: string) {
      const quiz = store.quiz(id);
      requireEdit(quiz, 'a quiz');
      await store.saveQuiz({ ...quiz, questions: quiz.questions.filter((question) => question.id !== questionId) });
      return store.quiz(id);
    },

    async orderQuestions(id: string, ids: string[]) {
      const quiz = store.quiz(id);
      requireEdit(quiz, 'a quiz');
      const byId = new Map(quiz.questions.map((question) => [question.id, question]));
      await store.saveQuiz({ ...quiz, questions: [...ids.flatMap((held) => byId.get(held) ?? []), ...quiz.questions.filter((question) => !ids.includes(question.id))] });
      return store.quiz(id);
    },

    // The file as a person edits it in Source, which may reshape anything but what makes it this quiz.
    quizSource(id: string) {
      const quiz = store.quiz(id);
      if (!canEdit(quiz, store.me())) throw new HostError(403, "only a quiz's creator and the project's owners change it");
      return { text: renderQuiz(quiz) };
    },

    async saveQuizSource(id: string, text: string) {
      const quiz = store.quiz(id);
      requireEdit(quiz, 'a quiz');
      let read: Quiz;
      try {
        read = parseQuiz(text, quiz.path, quiz.course);
      } catch (cause) {
        throw new HostError(400, cause instanceof Error ? `this file can't be saved: ${cause.message}` : String(cause));
      }
      if (read.id !== quiz.id) throw new HostError(400, `this file's id is ${quiz.id}, and an id is permanent`);
      await store.saveQuiz(read);
      return store.quiz(id);
    },

    async removeQuiz(id: string) {
      requireEdit(store.quiz(id), 'a quiz');
      return store.removeQuiz(id);
    },

    // ---- courses ----

    course(id: string) {
      const course = store.course(id);
      const me = store.me();
      const alias = me?.alias ?? null;
      const quizzes = rows().filter((row) => row.course === course.id);
      const taken = quizzes.filter((row) => row.best !== null);
      const sessions = store.blueprintsOf(course.study_plan);
      const done = alias ? store.sessionsDone(alias) : {};
      return {
        course,
        may: { edit: canEdit(course, me) },
        quizzes,
        progress: {
          taken: taken.length,
          of: quizzes.length,
          average_best: taken.length > 0 ? taken.reduce((sum, row) => sum + (row.best ?? 0), 0) / taken.length : null,
          sessions_done: sessions.filter((session) => done[session.id]).length,
          sessions: sessions.length,
        },
        content: store.blueprintsOf(course.content),
        sessions: sessions.map((session) => ({ ...session, done: Boolean(done[session.id]) })),
      };
    },

    async createCourse(input: { title: string; description?: string; content?: string[]; study_plan?: string[] }): Promise<Course> {
      return store.createCourse(input);
    },

    async updateCourse(id: string, patch: { title?: string; description?: string; content?: string[]; study_plan?: string[]; created_by?: string | null }) {
      const course = store.course(id);
      requireEdit(course, 'a course');
      const next: Course = {
        ...course,
        ...(patch.title !== undefined ? { title: patch.title.trim() || course.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.content ? { content: patch.content } : {}),
        ...(patch.study_plan ? { study_plan: patch.study_plan } : {}),
        ...(patch.created_by !== undefined ? { created_by: patch.created_by } : {}),
      };
      await store.saveCourse(next);
      return next;
    },

    async reorderCourse(id: string, ids: string[]) {
      requireEdit(store.course(id), 'a course');
      await store.reorder(id, ids);
    },

    async removeCourse(id: string) {
      requireEdit(store.course(id), 'a course');
      return store.removeCourse(id);
    },

    // ---- beside a blueprint ----

    forBlueprint(blueprintId: string) {
      const courses = store.list().courses.filter((course) => course.study_plan.length > 0 && store.blueprintsOf(course.study_plan).some((session) => session.id === blueprintId));
      const alias = store.me()?.alias ?? null;
      const course = courses[0] ?? null;
      const sessions = course ? store.blueprintsOf(course.study_plan) : [];
      const done = alias ? store.sessionsDone(alias) : {};
      return {
        quizzes: rows().filter((row) => row.draws_from.includes(blueprintId)),
        plan: course
          ? {
              course: course.title,
              place: sessions.findIndex((session) => session.id === blueprintId) + 1,
              of: sessions.length,
              sessions_done: sessions.filter((session) => done[session.id]).length,
              done: Boolean(done[blueprintId]),
            }
          : null,
      };
    },

    async setSessionDone(blueprint: string, done: boolean) {
      const person = store.signer();
      await store.setSessionDone(person.alias!, blueprint, done);
    },

    // what New quiz and a course's links offer to pick from
    pickable() {
      const context = host.context();
      const blueprints = context.blueprints.flatMap((blueprint) => {
        const id = blueprint.properties?.['id'];
        const title = blueprint.properties?.['title'];
        return typeof id === 'string' ? [{ id, title: typeof title === 'string' ? title : id }] : [];
      });
      const groups = new Set<string>();
      for (const blueprint of context.blueprints) {
        groups.add(blueprint.collection.name);
        if (blueprint.group) groups.add(`${blueprint.collection.name}/${blueprint.group}`);
      }
      return { blueprints, groups: [...groups].sort() };
    },
  };
}
