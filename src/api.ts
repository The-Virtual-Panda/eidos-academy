// What the page and the commands both ask of the plugin, and the soft permission over it:
// who is shown what (Academy REQ23). The files stay readable by anyone with the project.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { GUEST_ATTEMPT } from './share.ts';
import { HostError, type Host } from 'eidosmd/plugin';
import {
  accessOf,
  askable,
  cardProblems,
  cardsAcross,
  cardsFromQuiz,
  cardsToStudy,
  deckProgress,
  makeReview,
  standings,
  studiable,
  STUDY_MODES,
  canEdit,
  canManage,
  canSeeCourse,
  courseProgress,
  canSeeResults,
  compare,
  everyone,
  makeAttempt,
  myScores,
  scoredAttempts,
  normalizeQuestion,
  referenceLink,
  settled,
  writtenAnswers,
  type GivenAnswer,
  type Grade,
  percent,
  practiceSets,
  questionProblems,
  type Attempt,
  type AttemptKind,
  type AttemptMode,
  type Card,
  type Course,
  type Deck,
  type DeckProgress,
  type Review,
  type StudyMode,
  type Question,
  type Quiz,
  type QuizStatus,
  GUEST_NAMES,
  type GuestName,
} from './model.ts';
import { LOCAL_PERSON, Store, type ProjectPerson } from './store.ts';

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
  created_by_name: string | null;
  status: QuizStatus;
  best: number | null;
  // the person has an official attempt with an answer still waiting for a grade
  waiting: boolean;
  may_edit: boolean;
  may_manage: boolean;
  // kept just for the person, on this machine (Academy REQ76)
  local: boolean;
}

export interface DeckRow {
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
  status: QuizStatus;
  // the person's own, from their sessions
  learned: number;
  learning: number;
  unseen: number;
  last_studied: string | null;
  may_edit: boolean;
  may_manage: boolean;
  local: boolean;
}

export type Api = ReturnType<typeof makeApi>;

export function makeApi(host: Host) {
  const store = new Store(host);

  const myAttempts = (quiz: string, alias: string | null): Attempt[] => {
    const official = alias ? store.officialAttempts(quiz).filter((attempt) => attempt.by === alias) : [];
    const practice = store.practiceAttempts(quiz).filter((attempt) => alias === null || attempt.by === alias || attempt.by === LOCAL_PERSON);
    return [...official, ...practice];
  };

  const bestOf = (quiz: string, alias: string | null, official: Attempt[]): number | null => {
    if (!alias) return null;
    const mine = official.filter((attempt) => attempt.quiz === quiz && attempt.by === alias);
    const counted = mine.filter(settled);
    return counted.length > 0 ? Math.max(...counted.map(percent)) : null;
  };

  // The person's best on a quiz: their best official attempt, or on a local quiz their best whole attempt here.
  const ownBest = (quiz: Quiz, alias: string | null, official: Attempt[]): number | null => {
    if (!quiz.local) return bestOf(quiz.id, alias, official);
    const counted = scoredAttempts(quiz, myAttempts(quiz.id, alias)).filter((attempt) => attempt.kind === 'official' && settled(attempt));
    return counted.length > 0 ? Math.max(...counted.map(percent)) : null;
  };

  // A quiz kept just for the person has nobody else's results to show (Academy REQ77).
  const notLocal = (quiz: Quiz, what: string): void => {
    if (quiz.local) throw new HostError(409, `${quiz.title} is just yours, kept on this machine, so it has no ${what}`);
  };

  // Why a shared quiz, deck, or course can't be kept just for one person again: someone's history
  // with it would be stranded (Academy REQ80). Null when it can.
  const keepWhy = (id: string): string | null => {
    const listed = store.list();
    const names = (aliases: string[]): string => {
      const named = [...new Set(aliases)].map((alias) => nameOf(alias) ?? alias);
      return named.length <= 2 ? named.join(' and ') : `${named.slice(0, 2).join(', ')}, and ${named.length - 2} more`;
    };
    const quizWhy = (quiz: Quiz): string | null => {
      const official = store.officialAttempts(quiz.id);
      const takers = [...new Set(official.map((attempt) => attempt.by))];
      if (takers.length > 0) return `${names(takers)} ${takers.length === 1 ? 'has' : 'have'} taken ${quiz.title} officially`;
      if (store.guestAttempts(quiz.id).length > 0) return `Guests have answered ${quiz.title} from a public link`;
      if (existsSync(path.join(store.root, store.sharePaths(quiz.id).guest))) return `${quiz.title} has a public link`;
      return null;
    };
    const deckWhy = (deck: Deck): string | null => {
      const studied = store.studiedBy(deck.id);
      return studied.length > 0 ? `${names(studied)} ${studied.length === 1 ? 'has' : 'have'} studied ${deck.title}` : null;
    };
    const course = listed.courses.find((held) => held.id.toLowerCase() === id.toLowerCase());
    if (course) {
      const enrolled = store.enrolledIn(course.id);
      if (enrolled.length > 0) return `${names(enrolled.map((person) => person.alias))} ${enrolled.length === 1 ? 'is' : 'are'} enrolled in it`;
      for (const placed of store.inCourse(course.id)) {
        const why = placed.kind === 'quiz' ? quizWhy(placed.item) : deckWhy(placed.item);
        if (why) return why;
      }
      return null;
    }
    const quiz = listed.quizzes.find((held) => held.id.toLowerCase() === id.toLowerCase());
    if (quiz) return quizWhy(quiz);
    return deckWhy(store.deck(id));
  };

  // A quiz, a deck, or a course by its id, whichever it is.
  const anything = (id: string): { kind: 'quiz' | 'deck' | 'course'; item: Quiz | Deck | Course } => {
    const listed = store.list();
    const key = id.toLowerCase();
    const course = listed.courses.find((held) => held.id.toLowerCase() === key);
    if (course) return { kind: 'course', item: course };
    const quiz = listed.quizzes.find((held) => held.id.toLowerCase() === key);
    if (quiz) return { kind: 'quiz', item: quiz };
    const deck = listed.decks.find((held) => held.id.toLowerCase() === key);
    if (deck) return { kind: 'deck', item: deck };
    throw new HostError(404, `no quiz, deck, or course ${id}; eidos academy list shows them`);
  };

  const nameOf = (alias: string | null): string | null => (alias === null ? null : (store.people().find((person) => person.alias === alias)?.name ?? alias));

  // Each quiz's and deck's place in its course, which the two share.
  const placesOf = (): Map<string, number> => {
    const places = new Map<string, number>();
    for (const course of store.list().courses) store.inCourse(course.id).forEach((placed, index) => places.set(placed.item.id, index + 1));
    return places;
  };

  const courseOrder = (courses: Course[]) => (a: { course: string | null; rank: number; title: string }, b: { course: string | null; rank: number; title: string }) =>
    (courses.find((course) => course.id === a.course)?.title ?? '\uffff').localeCompare(courses.find((course) => course.id === b.course)?.title ?? '\uffff') ||
    a.rank - b.rank ||
    a.title.localeCompare(b.title);

  const rows = (): QuizRow[] => {
    const { quizzes, courses } = store.list();
    const me = store.me();
    const official = store.officialAttempts();
    const places = placesOf();
    const inOrder = [...quizzes].sort(courseOrder(courses));
    return inOrder.map((quiz) => {
      const place = quiz.course ? (places.get(quiz.id) ?? null) : null;
      return {
        id: quiz.id,
        title: quiz.title,
        path: quiz.path,
        course: quiz.course,
        course_title: courses.find((course) => course.id === quiz.course)?.title ?? null,
        place,
        status: quiz.status,
        draws_from: quiz.draws_from,
        questions: askable(quiz).length,
        created_by: quiz.created_by,
        created_by_name: nameOf(quiz.created_by),
        best: ownBest(quiz, me?.alias ?? null, official),
        waiting: !quiz.local && Boolean(me?.alias) && official.some((attempt) => attempt.quiz === quiz.id && attempt.by === me!.alias && !settled(attempt)),
        may_edit: canEdit(quiz, store.access()),
        may_manage: canManage(quiz, store.access()),
        local: quiz.local,
      };
    });
  };

  const deckRows = (): DeckRow[] => {
    const { decks, courses } = store.list();
    const alias = store.me()?.alias ?? null;
    const mine = store.reviewsOf(alias);
    const places = placesOf();
    return [...decks].sort(courseOrder(courses)).map((deck) => {
      const progress = deckProgress(
        deck,
        mine.filter((review) => review.deck === deck.id),
      );
      return {
        id: deck.id,
        title: deck.title,
        path: deck.path,
        course: deck.course,
        course_title: courses.find((course) => course.id === deck.course)?.title ?? null,
        place: deck.course ? (places.get(deck.id) ?? null) : null,
        draws_from: deck.draws_from,
        cards: studiable(deck).length,
        created_by: deck.created_by,
        created_by_name: nameOf(deck.created_by),
        status: deck.status,
        learned: progress.learned,
        learning: progress.learning,
        unseen: progress.new,
        last_studied: progress.last_studied,
        may_edit: canEdit(deck, store.access()),
        may_manage: canManage(deck, store.access()),
        local: deck.local,
      };
    });
  };

  const validCard = (card: Card): Card => {
    const problems = cardProblems(card);
    if (problems.length > 0) throw new HostError(400, `this card can't be saved yet: ${problems.join('; ')}`);
    return { id: card.id, front: String(card.front ?? ''), back: String(card.back ?? ''), reference: String(card.reference ?? '') };
  };

  // What a person studies from a deck: an open one, or a closed one they are trying out as its editor.
  const mayStudy = (deck: Deck): boolean => deck.status === 'open' || canEdit(deck, store.access());

  const requireEdit = (thing: { created_by: string | null }, what: string): void => {
    if (!canEdit(thing, store.access())) throw new HostError(403, `only ${what}'s creator, its proctors, and the project's owners change it`);
  };

  const quizzesOf = (course: Course): Quiz[] => store.list().quizzes.filter((quiz) => quiz.course === course.id);
  const mayWatch = (course: Course): boolean => canSeeCourse(course, quizzesOf(course), store.access());

  // The attempts a course's progress counts for a person: their official ones, or in a local course
  // their whole attempts on this machine, signed as them (Academy REQ79).
  const progressAttempts = (course: Course, alias: string): Attempt[] =>
    course.local
      ? store
          .practiceAttempts()
          .filter((attempt) => attempt.mode === 'whole' && (attempt.by === alias || attempt.by === LOCAL_PERSON))
          .map((attempt) => ({ ...attempt, kind: 'official' as const, by: alias }))
      : store.officialAttempts();

  const progressFor = (course: Course, alias: string) => {
    // each quiz keeps its place among the course's quizzes and decks, as the course numbers it
    const quizzes = store
      .inCourse(course.id)
      .map((placed, index) => ({ placed, place: index + 1 }))
      .filter(({ placed }) => placed.kind === 'quiz')
      .map(({ placed, place }) => ({ ...(placed.item as Quiz), place }));
    const progress = courseProgress(quizzes, progressAttempts(course, alias), alias);
    const sessions = store.blueprintsOf(course.study_plan);
    const done = store.sessionsDone(alias);
    return { progress, sessions_done: sessions.filter((session) => done[session.id]).length, sessions: sessions.length };
  };

  const validated = (given: Question): Question => {
    const question = normalizeQuestion(given);
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
        decks: deckRows(),
        // what Quizzes, Academy's name before 0.3.0, left in the project, for the page to offer the move
        quizzes_left: (() => {
          const left = store.quizzesLeft();
          return left.files.length + left.results.length > 0 ? { folder: left.folder, quizzes: left.files.length, results: left.results.length, may_move: store.access().owner } : null;
        })(),
        courses: store.list().courses.map((course) => ({
          id: course.id,
          title: course.title,
          created_by: course.created_by,
          enrolled: me?.alias ? Boolean(store.enrollmentsOf(me.alias)[course.id]) : false,
          may_edit: canEdit(course, store.access()),
          local: course.local,
        })),
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
      const inCourse = quiz.course ? store.inCourse(quiz.course) : [];
      const course = listed.courses.find((held) => held.id === quiz.course) ?? null;
      return {
        quiz,
        created_by_name: nameOf(quiz.created_by),
        proctor_names: Object.fromEntries(quiz.proctors.map((alias) => [alias, nameOf(alias)])),
        askable: askable(quiz).length,
        course: course ? { id: course.id, title: course.title } : null,
        place: quiz.course ? inCourse.findIndex((placed) => placed.item.id === quiz.id) + 1 : null,
        of: inCourse.length,
        may: {
          edit: canEdit(quiz, store.access()),
          manage: canManage(quiz, store.access()),
          results: !quiz.local && canSeeResults(quiz, store.access()),
          take_official: !quiz.local && store.cannotSign() === null,
          official_why: quiz.local ? null : store.cannotSign(),
          // a shared one kept just for its holder again, or why not (Academy REQ80)
          keep: !quiz.local && canManage(quiz, store.access()),
          keep_why: quiz.local ? null : keepWhy(quiz.id),
        },
        // written answers waiting for a grade, for those who grade them (Academy REQ65)
        to_grade:
          !quiz.local && canSeeResults(quiz, store.access())
            ? writtenAnswers([...store.officialAttempts(quiz.id), ...store.guestAttempts(quiz.id)]).filter((answer) => answer.earned === null).length
            : null,
        // guests' attempts from its public links, for the Guests tab (Academy REQ72); null to anyone who may not see them
        guests: !quiz.local && canSeeResults(quiz, store.access()) ? store.guestAttempts(quiz.id).length : null,
        scores: myScores(scoredAttempts(quiz, mine)),
        practice: practiceSets(quiz, mine),
        whole_quiz: askable(quiz).map((question) => question.id),
        // what the questions' references and the quiz's own sources name, so the page links them
        // and the builder offers the sections of what the quiz draws from first (Academy REQ61)
        references: store.sectionsOf([
          ...quiz.draws_from,
          ...quiz.questions.flatMap((question) => {
            const link = referenceLink(question.reference);
            return link?.kind === 'blueprint' ? [link.id] : [];
          }),
        ]),
        people: store
          .people()
          .filter((person) => !person.agent && person.alias)
          .map((person) => ({ alias: person.alias!, name: person.name })),
      };
    },

    compare(id: string) {
      const quiz = store.quiz(id);
      notLocal(quiz, 'scores to compare with');
      return compare(store.officialAttempts(quiz.id), store.me()?.alias ?? null);
    },

    results(id: string) {
      const quiz = store.quiz(id);
      notLocal(quiz, "anyone else's results");
      if (!canSeeResults(quiz, store.access())) throw new HostError(403, "a quiz's results are shown to its creator, its proctors, and the project's owners");
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
      if (attemptId.startsWith(GUEST_ATTEMPT)) {
        if (!canSeeResults(quiz, store.access())) throw new HostError(403, "guests' answers are shown to the quiz's creator, its proctors, and the project's owners");
        const guest = store.guestAttempts(quiz.id).find((attempt) => attempt.id === attemptId);
        if (!guest) throw new HostError(404, `no guest's attempt ${attemptId} on this quiz`);
        return guest;
      }
      const found = store.officialAttempts(quiz.id).find((attempt) => attempt.id === attemptId);
      if (!canSeeResults(quiz, store.access())) {
        // someone who follows a course sees the answers of the people enrolled in it
        const course = store.list().courses.find((held) => held.id === quiz.course);
        if (!found || !course || !mayWatch(course) || !store.enrollmentsOf(found.by)[course.id])
          throw new HostError(403, "another person's answers are shown to the quiz's creator, its proctors, and the project's owners");
      }
      if (!found) throw new HostError(404, `no attempt ${attemptId} on this quiz`);
      return found;
    },

    async submit(input: { quiz: string; kind: AttemptKind; mode: AttemptMode; answers: GivenAnswer[] }) {
      const quiz = store.quiz(input.quiz);
      if (input.kind !== 'official' && input.kind !== 'practice') throw new HostError(400, 'an attempt is official or practice');
      if (input.kind === 'official' && input.mode !== 'whole') throw new HostError(400, 'an official attempt takes the whole quiz');
      // a quiz kept just for the person is taken on this machine, its whole attempts counting as their scores (Academy REQ77)
      const kind: AttemptKind = quiz.local ? 'practice' : input.kind;
      // closed, a quiz takes no official attempts, and only those who edit it may try it out
      if (quiz.status === 'closed' && (kind === 'official' || !canEdit(quiz, store.access()))) throw new HostError(409, 'this quiz is closed');
      const by = kind === 'official' ? store.signer().alias! : store.practiceBy();
      const counts = quiz.local ? input.mode === 'whole' : kind === 'official';
      const earlier = quiz.local
        ? scoredAttempts(quiz, myAttempts(quiz.id, by === LOCAL_PERSON ? null : by)).filter((attempt) => attempt.kind === 'official' && settled(attempt))
        : store.officialAttempts(quiz.id).filter((attempt) => attempt.by === by && settled(attempt));
      let attempt: Attempt;
      try {
        attempt = makeAttempt({ id: store.newAttemptId(), quiz, kind, mode: input.mode, by, completedAt: new Date().toISOString(), answers: input.answers });
      } catch (cause) {
        throw new HostError(409, cause instanceof Error ? cause.message : String(cause));
      }
      await store.saveAttempt(attempt);
      const fraction = percent(attempt);
      const last = earlier.sort((a, b) => a.completed_at.localeCompare(b.completed_at)).at(-1);
      const mine = myAttempts(quiz.id, by);
      return {
        attempt,
        percent: fraction,
        first: counts && earlier.length === 0,
        new_best: counts && settled(attempt) && earlier.length > 0 && fraction > Math.max(...earlier.map(percent)),
        waiting: attempt.waiting ?? 0,
        change: last ? fraction - percent(last) : null,
        official_attempts: earlier.length + (counts ? 1 : 0),
        average: quiz.local ? null : compare(store.officialAttempts(quiz.id), null).average,
        practice: practiceSets(quiz, mine),
      };
    },

    // ---- grading written answers (Academy REQ65 to REQ67) ----

    toGrade(id: string) {
      const quiz = store.quiz(id);
      notLocal(quiz, 'answers for anyone else to grade');
      if (!canSeeResults(quiz, store.access())) throw new HostError(403, "a quiz's written answers are graded by its creator, its proctors, and the project's owners");
      const names = new Map(store.people().map((person) => [person.alias, person.name]));
      const guests = new Map(store.guestAttempts(quiz.id).map((attempt) => [attempt.id, attempt.guest?.name ?? null]));
      // a guest's written answer waits beside the project's people's, marked as a guest's (Academy REQ74)
      const answers = writtenAnswers([...store.officialAttempts(quiz.id), ...store.guestAttempts(quiz.id)]).map((answer) =>
        guests.has(answer.attempt) ? { ...answer, name: guests.get(answer.attempt) ?? 'A guest', guest: true } : { ...answer, name: names.get(answer.person) ?? answer.person, guest: false },
      );
      return { waiting: answers.filter((answer) => answer.earned === null), graded: answers.filter((answer) => answer.earned !== null).reverse() };
    },

    // An agent grades for the person who asked it, named with `for`, and its grade says AI.
    async grade(input: { quiz: string; attempt: string; question: string; points: number; note?: string; ai?: boolean; suggestion?: boolean; for?: string }): Promise<Grade> {
      const quiz = store.quiz(input.quiz);
      const acting = store.me();
      let grader: string;
      let ai = input.ai === true;
      if (acting?.agent) {
        const asked = store.people().find((person) => !person.agent && person.alias === input.for);
        if (!asked) throw new HostError(400, 'an agent grades for the person who asked it: name them with --for <alias>');
        if (
          !canSeeResults(
            quiz,
            accessOf(
              asked,
              store.people().some((person) => person.owner),
            ),
          )
        )
          throw new HostError(403, `@${asked.alias} does not grade this quiz`);
        grader = asked.alias!;
        ai = true;
      } else {
        if (!canSeeResults(quiz, store.access())) throw new HostError(403, "a quiz's written answers are graded by its creator, its proctors, and the project's owners");
        grader = store.signer('Grading').alias!;
      }
      const attempt = (input.attempt.startsWith(GUEST_ATTEMPT) ? store.guestAttempts(quiz.id) : store.officialAttempts(quiz.id)).find((held) => held.id === input.attempt);
      if (!attempt) throw new HostError(404, `no official attempt ${input.attempt} on this quiz`);
      const answer = attempt.answers.find((held) => held.question.id === input.question);
      if (!answer) throw new HostError(404, `attempt ${attempt.id} has no question ${input.question}`);
      if (answer.question.type !== 'written') throw new HostError(400, 'only a written answer takes a grade; every other answer is scored as it is given');
      const points = Number(input.points);
      if (!Number.isInteger(points) || points < 0 || points > answer.question.points) throw new HostError(400, `a grade is a whole number of points from 0 to ${answer.question.points}`);
      const grade: Grade = {
        id: store.newGradeId(),
        attempt: attempt.id,
        person: attempt.by,
        quiz: quiz.id,
        question: answer.question.id,
        points,
        note: (input.note ?? '').trim(),
        by: grader,
        ai,
        suggestion: input.suggestion === true,
        at: new Date().toISOString(),
      };
      await store.saveGrade(grade);
      return grade;
    },

    // ---- guests' attempts from a quiz's public links (Academy REQ72, REQ73) ----

    guests(id: string) {
      const quiz = store.quiz(id);
      notLocal(quiz, 'guests');
      if (!canSeeResults(quiz, store.access())) throw new HostError(403, "guests' attempts are shown to the quiz's creator, its proctors, and the project's owners");
      return {
        attempts: store.guestAttempts(quiz.id).map((attempt) => ({
          id: attempt.id,
          name: attempt.guest?.name ?? null,
          link: attempt.guest?.link ?? '',
          completed_at: attempt.completed_at,
          score: attempt.score,
          total: attempt.total,
          waiting: attempt.waiting ?? 0,
        })),
      };
    },

    removeGuests(id: string, which: { attempt?: string; link?: string }) {
      const quiz = store.quiz(id);
      if (!canSeeResults(quiz, store.access())) throw new HostError(403, "guests' attempts are removed by the quiz's creator, its proctors, and the project's owners");
      if (typeof which.link === 'string' && which.link !== '') return { removed: store.removeGuestAttempts(quiz.id, { link: which.link }) };
      if (typeof which.attempt === 'string' && which.attempt.startsWith(GUEST_ATTEMPT)) return { removed: store.removeGuestAttempts(quiz.id, { submission: which.attempt }) };
      throw new HostError(400, "name the guest's attempt, or the link whose attempts to remove");
    },

    // ---- from the page, under the soft permission ----

    async createQuiz(input: { title: string; draws_from?: string[]; course?: string | null; place?: number | null; local?: boolean }) {
      if (input.course) requireEdit(store.course(input.course), 'a course');
      return store.createQuiz({
        title: input.title,
        draws_from: input.draws_from ?? [],
        course: input.course ?? null,
        rank: input.place ?? null,
        ...(typeof input.local === 'boolean' ? { local: input.local } : {}),
      });
    },

    async updateQuiz(
      id: string,
      patch: {
        title?: string;
        draws_from?: string[];
        proctors?: string[];
        created_by?: string | null;
        course?: string | null;
        status?: QuizStatus;
        shuffle_questions?: boolean;
        shuffle_options?: boolean;
        guest_name?: GuestName;
      },
    ) {
      let quiz = store.quiz(id);
      requireEdit(quiz, 'a quiz');
      if (patch.status === 'open' && askable(quiz).length === 0) throw new HostError(400, 'add a question before opening this quiz');
      if ((patch.proctors !== undefined || patch.created_by !== undefined) && !canManage(quiz, store.access()))
        throw new HostError(403, "only a quiz's creator and the project's owners change who holds it");
      if (patch.course !== undefined) {
        if (patch.course) requireEdit(store.course(patch.course), 'a course');
        quiz = await store.moveQuiz(quiz.id, patch.course);
      }
      const next: Quiz = {
        ...quiz,
        ...(patch.status ? { closed: patch.status === 'closed' } : {}),
        ...(patch.title !== undefined ? { title: patch.title.trim() || quiz.title } : {}),
        ...(patch.draws_from ? { draws_from: patch.draws_from } : {}),
        ...(patch.proctors ? { proctors: patch.proctors } : {}),
        ...(patch.created_by !== undefined ? { created_by: patch.created_by } : {}),
        ...(typeof patch.shuffle_questions === 'boolean' ? { shuffle_questions: patch.shuffle_questions } : {}),
        ...(typeof patch.shuffle_options === 'boolean' ? { shuffle_options: patch.shuffle_options } : {}),
        ...(patch.guest_name !== undefined && GUEST_NAMES.includes(patch.guest_name) ? { guest_name: patch.guest_name } : {}),
      };
      await store.saveQuiz(next);
      return store.quiz(id);
    },

    async saveQuestion(id: string, question: Question) {
      const quiz = store.quiz(id);
      requireEdit(quiz, 'a quiz');
      question = validated(question);
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
    async removeQuiz(id: string) {
      if (!canManage(store.quiz(id), store.access())) throw new HostError(403, "only a quiz's creator and the project's owners delete it");
      return store.removeQuiz(id);
    },

    // ---- courses ----

    course(id: string) {
      const course = store.course(id);
      const me = store.me();
      const alias = me?.alias ?? null;
      const quizzes = rows().filter((row) => row.course === course.id);
      const decks = deckRows().filter((row) => row.course === course.id);
      const taken = quizzes.filter((row) => row.best !== null);
      const items = [...quizzes.map((row) => ({ kind: 'quiz' as const, row })), ...decks.map((row) => ({ kind: 'deck' as const, row }))].sort((a, b) => (a.row.place ?? 0) - (b.row.place ?? 0));
      const sessions = store.blueprintsOf(course.study_plan);
      const done = alias ? store.sessionsDone(alias) : {};
      const enrolled = store.enrolledIn(course.id);
      return {
        course,
        created_by_name: nameOf(course.created_by),
        may: {
          edit: canEdit(course, store.access()),
          people: !course.local && mayWatch(course),
          // a local course follows the person without enrolling (Academy REQ79)
          enroll: !course.local && store.cannotSign('Enrolling') === null,
          enroll_why: course.local ? null : store.cannotSign('Enrolling'),
          keep: !course.local && canManage(course, store.access()),
          keep_why: course.local ? null : keepWhy(course.id),
        },
        enrolled_since: enrolled.find((person) => person.alias === alias)?.since ?? null,
        enrolled_people: enrolled.length,
        people: store
          .people()
          .filter((person) => !person.agent && person.alias)
          .map((person) => ({ alias: person.alias!, name: person.name })),
        quizzes,
        decks,
        items,
        progress: {
          taken: taken.length,
          of: quizzes.length,
          average_best: taken.length > 0 ? taken.reduce((sum, row) => sum + (row.best ?? 0), 0) / taken.length : null,
          cards_learned: decks.reduce((sum, row) => sum + row.learned, 0),
          cards_learning: decks.reduce((sum, row) => sum + row.learning, 0),
          cards: decks.reduce((sum, row) => sum + row.cards, 0),
          sessions_done: sessions.filter((session) => done[session.id]).length,
          sessions: sessions.length,
        },
        content: store.blueprintsOf(course.content),
        sessions: sessions.map((session) => ({ ...session, done: Boolean(done[session.id]) })),
      };
    },

    // ---- enrolling, and a person's way through a course ----

    // Anyone may enroll, a course's creator and its proctors too (Academy REQ41).
    async enroll(id: string) {
      const course = store.course(id);
      if (course.local) throw new HostError(409, `${course.title} is just yours, so its progress follows you without enrolling`);
      const person = store.signer('Enrolling');
      await store.setEnrolled(person.alias!, course.id, true);
      return { course: course.id, alias: person.alias!, enrolled: true };
    },

    // Leaving keeps every result: it only stops the course following them.
    async leave(id: string) {
      const course = store.course(id);
      const alias = store.me()?.alias;
      if (!alias) throw new HostError(400, 'pick who you are in the project to leave a course');
      await store.setEnrolled(alias, course.id, false);
      return { course: course.id, alias, enrolled: false };
    },

    // One enrolled person's quizzes and scores: your own, or anyone's for those REQ43 names.
    courseProgress(id: string, person?: string | null) {
      const course = store.course(id);
      if (course.local) {
        const own = store.me()?.alias ?? LOCAL_PERSON;
        return { course: { id: course.id, title: course.title }, person: { alias: own, name: nameOf(own) ?? 'You' }, mine: true, enrolled_since: null, ...progressFor(course, own) };
      }
      const me = store.me()?.alias ?? null;
      const alias = person || me;
      if (alias !== me && !mayWatch(course)) throw new HostError(403, "another person's progress is shown to the course's creator, its quizzes' creators and proctors, and the project's owners");
      if (!alias) throw new HostError(400, 'pick who you are in the project to see your progress');
      const since = store.enrollmentsOf(alias)[course.id];
      if (!since)
        throw new HostError(404, alias === me ? `you are not enrolled in ${course.title}; eidos quizzes course enroll ${course.id} enrolls you` : `@${alias} is not enrolled in ${course.title}`);
      return { course: { id: course.id, title: course.title }, person: { alias, name: nameOf(alias) ?? alias }, mine: alias === me, enrolled_since: since, ...progressFor(course, alias) };
    },

    // Everyone enrolled in a course, each with their progress, for those REQ43 names.
    courseRoster(id: string) {
      const course = store.course(id);
      if (course.local) throw new HostError(409, `${course.title} is just yours, so nobody else is enrolled in it`);
      if (!mayWatch(course)) throw new HostError(403, "who enrolled in a course is shown to its creator, its quizzes' creators and proctors, and the project's owners");
      const people = store
        .enrolledIn(course.id)
        .map(({ alias, since }) => {
          const { progress, sessions_done, sessions } = progressFor(course, alias);
          return { alias, name: nameOf(alias) ?? alias, since, taken: progress.taken, of: progress.of, average_best: progress.average_best, last_taken: progress.last_taken, sessions_done, sessions };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      const scored = people.flatMap((person) => person.average_best ?? []);
      return { people, average_best: scored.length > 0 ? scored.reduce((sum, best) => sum + best, 0) / scored.length : null };
    },

    async createCourse(input: { title: string; description?: string; content?: string[]; study_plan?: string[]; local?: boolean }): Promise<Course> {
      return store.createCourse({ ...input, local: input.local === true });
    },

    // ---- kept just for the person, and shared with the project (Academy REQ76, REQ80) ----

    // Moves a local quiz, deck, or course into the plugin's folder, the person selected becoming its
    // creator. Its attempts and sessions stay on this machine as they are: practice, never official.
    async share(id: string) {
      const { item } = anything(id);
      if (!item.local) throw new HostError(409, `${item.title} is already the project's`);
      const alias = store.me()?.alias;
      return { ...(await store.moveAcross(item.id, false, alias ?? undefined)), local: false };
    },

    // Keeps a shared quiz, deck, or course just for the person again, while nobody's history is with it.
    async keep(id: string) {
      const { kind, item } = anything(id);
      if (item.local) throw new HostError(409, `${item.title} is already just yours`);
      if (!canManage(item, store.access())) throw new HostError(403, `only the ${kind}'s creator and the project's owners keep it just for themselves`);
      const why = keepWhy(item.id);
      if (why) throw new HostError(409, `${why}, so it stays with the project`);
      return { ...(await store.moveAcross(item.id, true, undefined)), local: true };
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
        decks: deckRows().filter((row) => row.draws_from.includes(blueprintId)),
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

    // ---- decks ----

    // A deck with what this person may do with it, where they stand in it, and each card's standing.
    deck(id: string) {
      const deck = store.deck(id);
      const alias = store.me()?.alias ?? null;
      const mine = store.reviewsOf(alias, deck.id);
      const listed = store.list();
      const inCourse = deck.course ? store.inCourse(deck.course) : [];
      const course = listed.courses.find((held) => held.id === deck.course) ?? null;
      const held = standings(deck, mine);
      const studier = (() => {
        try {
          return store.studier();
        } catch {
          return null;
        }
      })();
      return {
        deck,
        created_by_name: nameOf(deck.created_by),
        proctor_names: Object.fromEntries(deck.proctors.map((alias) => [alias, nameOf(alias)])),
        studiable: studiable(deck).length,
        course: course ? { id: course.id, title: course.title } : null,
        place: deck.course ? inCourse.findIndex((placed) => placed.item.id === deck.id) + 1 : null,
        of: inCourse.length,
        made_from: deck.made_from
          ? listed.quizzes.find((quiz) => quiz.id === deck.made_from)
            ? { id: deck.made_from, title: listed.quizzes.find((quiz) => quiz.id === deck.made_from)!.title }
            : { id: deck.made_from, title: null }
          : null,
        may: {
          edit: canEdit(deck, store.access()),
          manage: canManage(deck, store.access()),
          study: mayStudy(deck) && studier !== null,
          // a local deck's sessions stay on this machine whoever is selected (Academy REQ78)
          shared: !deck.local && (studier?.shared ?? false),
          keep: !deck.local && canManage(deck, store.access()),
          keep_why: deck.local ? null : keepWhy(deck.id),
        },
        progress: deckProgress(deck, mine),
        missed_last: cardsToStudy(deck, mine, 'missed').length,
        standings: Object.fromEntries([...held.entries()]),
        quizzes: listed.quizzes.map((quiz) => ({ id: quiz.id, title: quiz.title, questions: askable(quiz).length })),
        people: store
          .people()
          .filter((person) => !person.agent && person.alias)
          .map((person) => ({ alias: person.alias!, name: person.name })),
      };
    },

    // The cards a study session takes, from one deck, or across every open deck (or a course's).
    study(input: { deck?: string | null; course?: string | null; mode?: StudyMode | null }) {
      const mode: StudyMode = input.mode ?? 'next';
      if (!STUDY_MODES.includes(mode)) throw new HostError(400, 'a study session takes the next cards, the missed ones, or the whole deck');
      const alias = store.me()?.alias ?? null;
      const mine = store.reviewsOf(alias);
      if (input.deck) {
        const deck = store.deck(input.deck);
        if (!mayStudy(deck)) throw new HostError(409, 'this deck is closed');
        const byId = new Map(deck.cards.map((card) => [card.id, card]));
        const held = standings(
          deck,
          mine.filter((review) => review.deck === deck.id),
        );
        return {
          title: deck.title,
          deck: deck.id,
          mode,
          cards: cardsToStudy(
            deck,
            mine.filter((review) => review.deck === deck.id),
            mode,
          ).map((card) => ({ deck: deck.id, deck_title: deck.title, card: byId.get(card)!, state: held.get(card)?.state ?? 'new' })),
        };
      }
      const decks = store.list().decks.filter((deck) => deck.status === 'open' && (input.course ? deck.course === input.course : true));
      const picked = cardsAcross(
        decks.map((deck) => ({ deck, reviews: mine.filter((review) => review.deck === deck.id) })),
        20,
      );
      const byDeck = new Map(
        decks.map((deck) => [
          deck.id,
          {
            deck,
            cards: new Map(deck.cards.map((card) => [card.id, card])),
            held: standings(
              deck,
              mine.filter((review) => review.deck === deck.id),
            ),
          },
        ]),
      );
      return {
        title: input.course ? store.course(input.course).title : 'Your decks',
        deck: null,
        mode: 'next' as StudyMode,
        cards: picked.map(({ deck, card }) => {
          const held = byDeck.get(deck)!;
          return { deck, deck_title: held.deck.title, card: held.cards.get(card)!, state: held.held.get(card)?.state ?? 'new' };
        }),
      };
    },

    // A study session saved: one file per deck it touched, signed by the person studying.
    async saveStudy(input: { mode: StudyMode; started_at: string; answers: Array<{ deck: string; card: string; got: boolean; at?: string }> }) {
      if (!Array.isArray(input.answers) || input.answers.length === 0) throw new HostError(400, 'a study session answers at least one card');
      const { by, shared } = store.studier();
      const completedAt = new Date().toISOString();
      const decks = [...new Set(input.answers.map((answer) => answer.deck))];
      const saved: Review[] = [];
      const results = [];
      // whether any of it went with the project, or all of it stayed on this machine
      let keptShared = false;
      for (const id of decks) {
        const deck = store.deck(id);
        if (!mayStudy(deck)) throw new HostError(409, `${deck.title} is closed`);
        const before = deckProgress(deck, store.reviewsOf(by === LOCAL_PERSON ? null : by, deck.id));
        let review: Review;
        try {
          review = makeReview({
            id: store.newReviewId(),
            deck,
            by,
            mode: decks.length > 1 ? 'next' : input.mode,
            startedAt: input.started_at || completedAt,
            completedAt,
            answers: input.answers.filter((answer) => answer.deck === id),
          });
        } catch (cause) {
          throw new HostError(409, cause instanceof Error ? cause.message : String(cause));
        }
        await store.saveReview(review, shared && !deck.local);
        if (shared && !deck.local) keptShared = true;
        saved.push(review);
        const after = deckProgress(deck, store.reviewsOf(by === LOCAL_PERSON ? null : by, deck.id));
        results.push({ deck: deck.id, title: deck.title, learned: after.learned, gained: after.learned - before.learned, of: after.of, left: after.of - after.learned });
      }
      const finals = new Map<string, { deck: string; card: Card; got: boolean }>();
      for (const review of saved) for (const answer of review.answers) finals.set(`${review.deck}/${answer.card.id}`, { deck: review.deck, card: answer.card, got: answer.got });
      const missed = [...finals.values()].filter((held) => !held.got);
      return {
        shared: keptShared,
        cards: finals.size,
        got: finals.size - missed.length,
        still_learning: missed.length,
        minutes: Math.max(1, Math.round((Date.parse(completedAt) - Date.parse(input.started_at || completedAt)) / 60000)),
        decks: results,
        missed: missed.map((held) => ({ deck: held.deck, front: held.card.front, back: held.card.back })),
      };
    },

    // Keep studying: every deck with where the person stands in it, and the totals across them.
    keepStudying() {
      const decks = deckRows().filter((row) => row.status === 'open' || row.may_edit);
      const sum = (key: 'learned' | 'learning' | 'unseen' | 'cards'): number => decks.reduce((total, row) => total + row[key], 0);
      return {
        decks,
        learned: sum('learned'),
        learning: sum('learning'),
        unseen: sum('unseen'),
        cards: sum('cards'),
        may_study: (() => {
          try {
            store.studier();
            return true;
          } catch {
            return false;
          }
        })(),
      };
    },

    async createDeck(input: { title: string; draws_from?: string[]; course?: string | null; place?: number | null; from_quiz?: string | null; local?: boolean }) {
      if (input.course) requireEdit(store.course(input.course), 'a course');
      const quiz = input.from_quiz ? store.quiz(input.from_quiz) : null;
      const taken: string[] = [];
      const cards = quiz
        ? cardsFromQuiz(quiz, () => {
            const id = store.newCardId({ cards: [] }, taken);
            taken.push(id);
            return id;
          })
        : [];
      return store.createDeck({
        title: input.title,
        draws_from: input.draws_from && input.draws_from.length > 0 ? input.draws_from : (quiz?.draws_from ?? []),
        course: input.course ?? quiz?.course ?? null,
        rank: input.place ?? null,
        made_from: quiz?.id ?? null,
        cards,
        ...(typeof input.local === 'boolean' ? { local: input.local } : quiz ? { local: quiz.local } : {}),
      });
    },

    async updateDeck(id: string, patch: { title?: string; draws_from?: string[]; proctors?: string[]; created_by?: string | null; course?: string | null; status?: QuizStatus; per_session?: number }) {
      let deck = store.deck(id);
      requireEdit(deck, 'a deck');
      if (patch.status === 'open' && studiable(deck).length === 0) throw new HostError(400, 'add a card before opening this deck');
      if ((patch.proctors !== undefined || patch.created_by !== undefined) && !canManage(deck, store.access()))
        throw new HostError(403, "only a deck's creator and the project's owners change who holds it");
      if (patch.per_session !== undefined && (!Number.isInteger(patch.per_session) || patch.per_session < 1 || patch.per_session > 500)) throw new HostError(400, 'a session takes 1 to 500 cards');
      if (patch.course !== undefined) {
        if (patch.course) requireEdit(store.course(patch.course), 'a course');
        deck = await store.moveDeck(deck.id, patch.course);
      }
      await store.saveDeck({
        ...deck,
        ...(patch.status ? { closed: patch.status === 'closed' } : {}),
        ...(patch.title !== undefined ? { title: patch.title.trim() || deck.title } : {}),
        ...(patch.draws_from ? { draws_from: patch.draws_from } : {}),
        ...(patch.proctors ? { proctors: patch.proctors } : {}),
        ...(patch.created_by !== undefined ? { created_by: patch.created_by } : {}),
        ...(patch.per_session !== undefined ? { per_session: patch.per_session } : {}),
      });
      return store.deck(id);
    },

    async saveCard(id: string, card: Card) {
      const deck = store.deck(id);
      requireEdit(deck, 'a deck');
      const valid = validCard(card);
      const at = deck.cards.findIndex((held) => held.id === valid.id);
      const cards = [...deck.cards];
      if (at >= 0) cards[at] = valid;
      else cards.push(valid);
      await store.saveDeck({ ...deck, cards });
      return store.deck(id);
    },

    async removeCard(id: string, cardId: string) {
      const deck = store.deck(id);
      requireEdit(deck, 'a deck');
      await store.saveDeck({ ...deck, cards: deck.cards.filter((card) => card.id !== cardId) });
      return store.deck(id);
    },

    async orderCards(id: string, ids: string[]) {
      const deck = store.deck(id);
      requireEdit(deck, 'a deck');
      const byId = new Map(deck.cards.map((card) => [card.id, card]));
      await store.saveDeck({ ...deck, cards: [...ids.flatMap((held) => byId.get(held) ?? []), ...deck.cards.filter((card) => !ids.includes(card.id))] });
      return store.deck(id);
    },

    // A quiz's questions added to a deck as cards, skipping any whose front the deck has already.
    async cardsFromQuiz(id: string, quizId: string) {
      const deck = store.deck(id);
      requireEdit(deck, 'a deck');
      const quiz = store.quiz(quizId);
      const fronts = new Set(deck.cards.map((card) => card.front.trim().toLowerCase()));
      const taken: string[] = [];
      const made = cardsFromQuiz(quiz, () => {
        const next = store.newCardId(deck, taken);
        taken.push(next);
        return next;
      }).filter((card) => !fronts.has(card.front.toLowerCase()));
      await store.saveDeck({ ...deck, made_from: deck.made_from ?? quiz.id, cards: [...deck.cards, ...made] });
      return { deck: store.deck(id), added: made.length };
    },

    async removeDeck(id: string) {
      if (!canManage(store.deck(id), store.access())) throw new HostError(403, "only a deck's creator and the project's owners delete it");
      return store.removeDeck(id);
    },

    // ---- from Quizzes ----

    moveFromQuizzes() {
      if (!store.access().owner) throw new HostError(403, "moving what Quizzes kept into Academy is for the project's owners");
      const moved = store.moveFromQuizzes();
      return {
        ...moved,
        then: [...(moved.folder ? [`eidos configure:folder remove ${moved.folder} --yes   # the Quizzes folder's entry, empty now`] : []), 'eidos plugin disable quizzes   # Quizzes is Academy now'],
      };
    },

    // what New quiz and a course's links offer to pick from
    pickable() {
      const context = host.context();
      const blueprints = context.blueprints.flatMap((blueprint) => {
        const id = blueprint.properties?.['id'];
        const title = blueprint.properties?.['title'];
        return typeof id === 'string' ? [{ id, title: typeof title === 'string' ? title : id }] : [];
      });
      // every collection and category the framework declares, an empty one included
      const groups = new Set<string>();
      for (const folder of context.framework.folders) {
        if (folder.ownedBy !== '@eidos/collections') continue;
        groups.add(folder.name);
        for (const group of (folder as { grouping?: { groups?: Array<{ name: string }> } | null }).grouping?.groups ?? []) groups.add(`${folder.name}/${group.name}`);
      }
      return { blueprints, groups: [...groups].sort() };
    },
  };
}
