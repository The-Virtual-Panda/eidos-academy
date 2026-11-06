// Quizzes's CLI entry, what every host loads: `eidos quizzes`, the check's findings on the
// plugin's files, and ids following a blueprint that takes a new one. The agent writes a quiz
// with these commands, as the page does; the words of a question are the conversation's.
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { HostError, type CliEntry, type Host } from 'eidosmd/plugin';
import { makeApi } from './api.ts';
import { askable, compare, questionProblems, renderCourse, renderQuiz, type Question } from './model.ts';

export type { Api } from './api.ts';

const collect = (value: string, held: string[]): string[] => [...held, value];

interface Options {
  opts(): { json?: boolean };
}

// Runs a command's work, printing a failure in words with a failing exit code.
async function run(command: Options, work: (json: boolean) => void | Promise<void>): Promise<void> {
  try {
    await work(command.opts().json === true);
  } catch (cause) {
    process.stderr.write(`error: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}

function say(json: boolean, value: unknown, words: string): void {
  process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${words}\n`);
}

const asPercent = (fraction: number | null): string => (fraction === null ? '-' : `${Math.round(fraction * 100)}%`);

interface QuestionOptions {
  prompt?: string;
  option: string[];
  answer?: string;
  why?: string;
  reference?: string;
}

// The option a person means: its 1-based number, as the options are listed.
function answerIndex(value: string | undefined, options: string[]): number | null {
  if (value === undefined) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > options.length) throw new HostError(400, `--answer is the option's number, 1 to ${options.length}`);
  return number - 1;
}

function checked(question: Question): Question {
  const problems = questionProblems(question);
  if (problems.length > 0) throw new HostError(400, `this question can't be saved: ${problems.join('; ')}`);
  return question;
}

const entry: CliEntry = {
  register(host: Host) {
    const api = makeApi(host);
    const { store } = api;

    host.command((quizzes) => {
      quizzes.description("quizzes on the project's content: build them, group them into courses, and read their scores");

      quizzes
        .command('list')
        .description('every quiz, with its course and place, what it draws from, and your best')
        .option('--json', '{ me, folder, quizzes[], courses[] }')
        .action(async (_options: unknown, command: Options) => {
          await run(command, (json) => {
            const overview = api.overview();
            const lines = overview.quizzes.map(
              (row) =>
                `${row.id}  ${row.title}  ·  ${row.course_title ? `${row.course_title} ${row.place}` : 'one-off'}  ·  ${row.status === 'closed' ? 'closed  ·  ' : ''}${row.questions} questions  ·  best ${asPercent(row.best)}`,
            );
            say(json, overview, lines.join('\n') || 'no quizzes yet; eidos quizzes new "<Title>" starts one');
          });
        });

      quizzes
        .command('show')
        .argument('<quiz>', "the quiz's id")
        .description('one quiz, with its questions and answers')
        .option('--json', 'the quiz: { id, title, draws_from[], created_by, proctors[], rank, course, questions[], path }')
        .action(async (id: string, _options: unknown, command: Options) => {
          await run(command, (json) => {
            const quiz = store.quiz(id);
            say(json, quiz, renderQuiz(quiz).trimEnd());
          });
        });

      quizzes
        .command('new')
        .argument('<title>', "the quiz's title")
        .description('start a quiz; add its questions with eidos quizzes question add')
        .option('--draws-from <source>', 'a blueprint id, an asset path, or a link (repeatable)', collect, [] as string[])
        .option('--course <course>', "the course's id; absent, a one-off")
        .option('--place <n>', 'its place in the course, from 1; absent, last')
        .option('--created-by <alias>', 'who created it; absent, you')
        .option('--closed', 'keep it closed until someone opens it; absent, it opens as soon as it has a question')
        .option('--open', 'the default, kept so a script that passes it still runs')
        .option('--json', 'the quiz')
        .action(async (title: string, options: { drawsFrom: string[]; course?: string; place?: string; createdBy?: string; closed?: boolean }, command: Options) => {
          await run(command, async (json) => {
            const quiz = await store.createQuiz({
              ...(options.closed ? { closed: true } : {}),
              title,
              draws_from: options.drawsFrom,
              course: options.course ? store.course(options.course).id : null,
              rank: options.place ? Number(options.place) : null,
              ...(options.createdBy ? { created_by: options.createdBy } : {}),
            });
            say(json, quiz, `started ${quiz.id}  ${quiz.path}`);
          });
        });

      quizzes
        .command('set')
        .argument('<quiz>', "the quiz's id")
        .description("change a quiz's title, sources, course, place, creator, or proctors")
        .option('--status <status>', 'open or closed')
        .option('--title <title>', 'its title')
        .option('--add-source <source>', 'a blueprint id, an asset path, or a link to draw from (repeatable)', collect, [] as string[])
        .option('--remove-source <source>', 'stop drawing from it (repeatable)', collect, [] as string[])
        .option('--course <course>', 'move it into this course; "" makes it a one-off')
        .option('--place <n>', 'its place in its course, from 1')
        .option('--created-by <alias>', 'hand it to another creator')
        .option('--add-proctor <alias>', 'a proctor (repeatable)', collect, [] as string[])
        .option('--remove-proctor <alias>', 'no longer a proctor (repeatable)', collect, [] as string[])
        .option('--json', 'the quiz')
        .action(
          async (
            id: string,
            options: {
              status?: string;
              title?: string;
              addSource: string[];
              removeSource: string[];
              course?: string;
              place?: string;
              createdBy?: string;
              addProctor: string[];
              removeProctor: string[];
            },
            command: Options,
          ) => {
            await run(command, async (json) => {
              let quiz = store.quiz(id);
              if (options.status !== undefined && options.status !== 'open' && options.status !== 'closed') throw new HostError(400, '--status is open or closed');
              if (options.status === 'open' && askable(quiz).length === 0) throw new HostError(400, 'add a question before opening this quiz');
              if (options.course !== undefined) quiz = await store.moveQuiz(quiz.id, options.course === '' ? null : store.course(options.course).id);
              const known = new Set(store.people().map((person) => person.alias));
              for (const alias of options.addProctor) if (!known.has(alias)) throw new HostError(400, `${alias} is not in the project's users; eidos users lists them`);
              await store.saveQuiz({
                ...quiz,
                ...(options.status ? { closed: options.status === 'closed' } : {}),
                ...(options.title ? { title: options.title } : {}),
                ...(options.createdBy ? { created_by: options.createdBy } : {}),
                draws_from: [...new Set([...quiz.draws_from.filter((source) => !options.removeSource.includes(source)), ...options.addSource])],
                proctors: [...new Set([...quiz.proctors.filter((alias) => !options.removeProctor.includes(alias)), ...options.addProctor])],
              });
              if (options.place) await store.place(quiz.id, Number(options.place));
              const saved = store.quiz(quiz.id);
              say(json, saved, `changed ${saved.id}  ${saved.path}`);
            });
          },
        );

      quizzes
        .command('remove')
        .argument('<quiz>', "the quiz's id")
        .description('delete a quiz; the results people already have stay in their history')
        .option('--json', '{ removed }')
        .action(async (id: string, _options: unknown, command: Options) => {
          await run(command, (json) => {
            const quiz = store.removeQuiz(id);
            say(json, { removed: quiz.id }, `removed ${quiz.id}`);
          });
        });

      const question = quizzes.command('question').description("add, change, or remove a quiz's questions");
      const questionFlags = (command: ReturnType<typeof question.command>) =>
        command
          .option('--prompt <text>', 'what is asked')
          .option('--option <text>', 'an option, in order (repeatable, two to five)', collect, [] as string[])
          .option('--answer <n>', "the right option's number, from 1")
          .option('--why <text>', 'why that answer is right')
          .option('--reference <text>', 'where it comes from')
          .option('--json', 'the question');

      questionFlags(question.command('add').argument('<quiz>', "the quiz's id").description('add a question to the end of a quiz')).action(
        async (id: string, options: QuestionOptions, command: Options) => {
          await run(command, async (json) => {
            const quiz = store.quiz(id);
            const added = checked({
              id: store.newQuestionId(quiz),
              prompt: options.prompt ?? '',
              options: options.option,
              answer: answerIndex(options.answer, options.option),
              why: options.why ?? '',
              reference: options.reference ?? '',
            });
            await store.saveQuiz({ ...quiz, questions: [...quiz.questions, added] });
            say(json, added, `added ${added.id} to ${quiz.id}`);
          });
        },
      );

      questionFlags(
        question
          .command('set')
          .argument('<quiz>', "the quiz's id")
          .argument('<question>', "the question's id")
          .description('change a question; it keeps its id unless --regenerated')
          .option('--regenerated', 'a new question in its place: it takes a new id and counts as not yet seen'),
      ).action(async (id: string, questionId: string, options: QuestionOptions & { regenerated?: boolean }, command: Options) => {
        await run(command, async (json) => {
          const quiz = store.quiz(id);
          const at = quiz.questions.findIndex((held) => held.id === questionId);
          const held = quiz.questions[at];
          if (!held) throw new HostError(404, `${quiz.id} has no question ${questionId}`);
          const choices = options.option.length > 0 ? options.option : held.options;
          const changed = checked({
            id: options.regenerated ? store.newQuestionId(quiz) : held.id,
            prompt: options.prompt ?? held.prompt,
            options: choices,
            answer: answerIndex(options.answer, choices) ?? (options.option.length > 0 ? null : held.answer),
            why: options.why ?? held.why,
            reference: options.reference ?? held.reference,
          });
          const questions = [...quiz.questions];
          questions[at] = changed;
          await store.saveQuiz({ ...quiz, questions });
          say(json, changed, `changed ${changed.id} in ${quiz.id}`);
        });
      });

      question
        .command('remove')
        .argument('<quiz>', "the quiz's id")
        .argument('<question>', "the question's id")
        .description('take a question out; past attempts keep their copy of it')
        .option('--json', '{ removed }')
        .action(async (id: string, questionId: string, _options: unknown, command: Options) => {
          await run(command, async (json) => {
            const quiz = store.quiz(id);
            if (!quiz.questions.some((held) => held.id === questionId)) throw new HostError(404, `${quiz.id} has no question ${questionId}`);
            await store.saveQuiz({ ...quiz, questions: quiz.questions.filter((held) => held.id !== questionId) });
            say(json, { removed: questionId }, `removed ${questionId} from ${quiz.id}`);
          });
        });

      const course = quizzes.command('course').description('group quizzes into ordered courses');
      course
        .command('list')
        .description('every course')
        .option('--json', '{ courses[] }')
        .action(async (_options: unknown, command: Options) => {
          await run(command, (json) => {
            const { courses, quizzes: all } = store.list();
            say(
              json,
              { courses },
              courses.map((held) => `${held.id}  ${held.title}  ·  ${all.filter((quiz) => quiz.course === held.id).length} quizzes`).join('\n') ||
                'no courses yet; eidos quizzes course new "<Title>" starts one',
            );
          });
        });
      course
        .command('show')
        .argument('<course>', "the course's id")
        .description('one course, with its quizzes in order and your progress')
        .option('--json', '{ course, enrolled_since, quizzes[], progress, content[], sessions[] }')
        .action(async (id: string, _options: unknown, command: Options) => {
          await run(command, (json) => {
            const shown = api.course(id);
            say(json, shown, [renderCourse(shown.course).trimEnd(), '', ...shown.quizzes.map((row) => `${row.place}. ${row.id}  ${row.title}  ·  best ${asPercent(row.best)}`)].join('\n'));
          });
        });
      course
        .command('enroll')
        .argument('<course>', "the course's id")
        .description('enroll in a course, to follow your scores across it; anyone may, its creator and proctors too')
        .option('--json', '{ course, alias, enrolled }')
        .action(async (id: string, _options: unknown, command: Options) => {
          await run(command, async (json) => {
            const done = await api.enroll(id);
            say(json, done, `@${done.alias} is enrolled in ${done.course}`);
          });
        });
      course
        .command('leave')
        .argument('<course>', "the course's id")
        .description('leave a course; your results stay')
        .option('--json', '{ course, alias, enrolled }')
        .action(async (id: string, _options: unknown, command: Options) => {
          await run(command, async (json) => {
            const done = await api.leave(id);
            say(json, done, `@${done.alias} is no longer enrolled in ${done.course}; their results stay`);
          });
        });
      course
        .command('progress')
        .argument('<course>', "the course's id")
        .description('an enrolled person: which quizzes they have taken, and their scores')
        .option('--person <alias>', "someone else's, if the course's results are yours to see; absent, yours")
        .option('--json', '{ course, person, mine, enrolled_since, progress: { taken, of, average_best, last_taken, quizzes[] }, sessions_done, sessions }')
        .action(async (id: string, options: { person?: string }, command: Options) => {
          await run(command, (json) => {
            const shown = api.courseProgress(id, options.person);
            const { progress } = shown;
            const lines = [
              `${shown.person.name} in ${shown.course.title}: ${progress.taken} of ${progress.of} quizzes taken, average best ${asPercent(progress.average_best)}`,
              ...progress.quizzes.map(
                (row) => `${row.place}. ${row.id}  ${row.title}  ·  ${row.attempts === 0 ? 'not yet' : `${row.attempts} attempts, latest ${asPercent(row.latest)}, best ${asPercent(row.best)}`}`,
              ),
            ];
            say(json, shown, lines.join('\n'));
          });
        });
      course
        .command('people')
        .argument('<course>', "the course's id")
        .description("everyone enrolled in a course and their progress, if the course's results are yours to see")
        .option('--json', '{ people[], average_best }')
        .action(async (id: string, _options: unknown, command: Options) => {
          await run(command, (json) => {
            const roster = api.courseRoster(id);
            say(
              json,
              roster,
              roster.people.map((person) => `${person.alias}  ${person.name}  ·  ${person.taken} of ${person.of} quizzes taken, average best ${asPercent(person.average_best)}`).join('\n') ||
                'nobody has enrolled yet',
            );
          });
        });
      course
        .command('new')
        .argument('<title>', "the course's title")
        .description('start a course')
        .option('--description <text>', 'a line or two on what it covers')
        .option('--content <link>', 'a collection, a category (specs/old-testament), or a blueprint id (repeatable)', collect, [] as string[])
        .option('--study-plan <link>', 'where its study plan is, the same way (repeatable)', collect, [] as string[])
        .option('--created-by <alias>', 'who created it; absent, you')
        .option('--json', 'the course')
        .action(async (title: string, options: { description?: string; content: string[]; studyPlan: string[]; createdBy?: string }, command: Options) => {
          await run(command, async (json) => {
            const made = await store.createCourse({
              title,
              description: options.description ?? '',
              content: options.content,
              study_plan: options.studyPlan,
              ...(options.createdBy ? { created_by: options.createdBy } : {}),
            });
            say(json, made, `started ${made.id}  ${made.path}`);
          });
        });
      course
        .command('set')
        .argument('<course>', "the course's id")
        .description("change a course's title, description, links, or creator")
        .option('--title <title>', 'its title')
        .option('--description <text>', 'a line or two on what it covers')
        .option('--add-content <link>', 'a link to its content (repeatable)', collect, [] as string[])
        .option('--remove-content <link>', 'no longer linked (repeatable)', collect, [] as string[])
        .option('--add-study-plan <link>', 'a link to its study plan (repeatable)', collect, [] as string[])
        .option('--remove-study-plan <link>', 'no longer linked (repeatable)', collect, [] as string[])
        .option('--created-by <alias>', 'hand it to another creator')
        .option('--json', 'the course')
        .action(
          async (
            id: string,
            options: { title?: string; description?: string; addContent: string[]; removeContent: string[]; addStudyPlan: string[]; removeStudyPlan: string[]; createdBy?: string },
            command: Options,
          ) => {
            await run(command, async (json) => {
              const held = store.course(id);
              const next = {
                ...held,
                ...(options.title ? { title: options.title } : {}),
                ...(options.description !== undefined ? { description: options.description } : {}),
                ...(options.createdBy ? { created_by: options.createdBy } : {}),
                content: [...new Set([...held.content.filter((link) => !options.removeContent.includes(link)), ...options.addContent])],
                study_plan: [...new Set([...held.study_plan.filter((link) => !options.removeStudyPlan.includes(link)), ...options.addStudyPlan])],
              };
              await store.saveCourse(next);
              say(json, next, `changed ${next.id}  ${next.path}`);
            });
          },
        );
      course
        .command('remove')
        .argument('<course>', "the course's id")
        .description('delete a course; its quizzes stay, as one-offs')
        .option('--json', '{ removed, quizzes }')
        .action(async (id: string, _options: unknown, command: Options) => {
          await run(command, async (json) => {
            const removed = await store.removeCourse(id);
            say(json, { removed: removed.course.id, quizzes: removed.quizzes }, `removed ${removed.course.id}; ${removed.quizzes} quizzes are one-offs now`);
          });
        });

      quizzes
        .command('results')
        .argument('<quiz>', "the quiz's id")
        .description("what you would see on the page: your own attempts and the quiz's totals, or everyone's if the results are yours to see")
        .option('--json', '{ mine, totals, everyone? }')
        .action(async (id: string, _options: unknown, command: Options) => {
          await run(command, (json) => {
            const shown = api.quiz(id);
            const totals = compare(store.officialAttempts(shown.quiz.id), api.me()?.alias ?? null);
            const all = shown.may.results ? api.results(id).people : null;
            const lines = [
              `${shown.quiz.title}: your best ${asPercent(shown.scores.best?.percent ?? null)}, latest ${asPercent(shown.scores.latest?.percent ?? null)}, ${shown.scores.official_attempts} official attempts`,
              `Quiz average ${asPercent(totals.average)}, ${totals.people} people`,
              ...(all ?? []).map((person) => `${person.alias}: ${person.attempts} attempts, latest ${asPercent(person.latest)}, best ${asPercent(person.best)}`),
            ];
            say(json, { mine: shown.scores, totals, ...(all ? { everyone: all } : {}) }, lines.join('\n'));
          });
        });

      const session = quizzes.command('session').description('mark a study session done or not, for you, never in its file');
      for (const [name, done] of [
        ['done', true],
        ['undone', false],
      ] as const) {
        session
          .command(name)
          .argument('<blueprint>', "the session's blueprint id")
          .description(done ? 'you finished this session' : 'you have not finished this session after all')
          .option('--json', '{ blueprint, done }')
          .action(async (blueprint: string, _options: unknown, command: Options) => {
            await run(command, async (json) => {
              await api.setSessionDone(blueprint, done);
              say(json, { blueprint, done }, `${blueprint} is ${done ? 'done' : 'not done'}`);
            });
          });
      }
    });

    // ---- what the check reports on the plugin's own files ----

    host.finding({
      code: 'unreadable',
      level: 'error',
      run: () => store.list().problems.map((problem) => ({ path: problem.path, message: problem.message })),
    });
    host.finding({
      code: 'question',
      level: 'warning',
      run: () =>
        store.list().quizzes.flatMap((quiz) =>
          quiz.questions.flatMap((held) => {
            const problems = questionProblems(held);
            return problems.length > 0 ? [{ path: quiz.path, message: `question ${held.id}: ${problems.join('; ')}, so it is left out when the quiz is taken` }] : [];
          }),
        ),
    });
    host.finding({
      code: 'source-gone',
      level: 'warning',
      run: () => {
        const context = host.context();
        const ids = new Set(context.blueprints.map((blueprint) => blueprint.properties?.['id']));
        return store.list().quizzes.flatMap((quiz) =>
          quiz.draws_from.flatMap((source) => {
            if (/^[a-z]+:\/\//i.test(source)) return [];
            const found = source.includes('/') ? existsSync(path.join(context.root, source)) : ids.has(source);
            return found ? [] : [{ path: quiz.path, message: `this quiz draws from ${source}, which is gone` }];
          }),
        );
      },
    });

    // ---- a blueprint's new id follows into what names it (Surfaces REQ12) ----

    host.onIdChange((changes) => {
      const renamed = new Map(changes.filter((change) => change.kind === undefined || change.kind === 'blueprint').map((change) => [change.from, change.to]));
      if (renamed.size === 0) return [];
      const follow = (list: string[]): string[] => list.map((item) => renamed.get(item) ?? item);
      const listed = store.list();
      const root = host.context().root;
      return [
        ...listed.quizzes
          .filter((quiz) => quiz.draws_from.some((source) => renamed.has(source)))
          .map((quiz) => ({
            path: quiz.path,
            what: `what ${quiz.id} draws from`,
            apply: () => writeFileSync(path.join(root, quiz.path), renderQuiz({ ...quiz, draws_from: follow(quiz.draws_from) })),
          })),
        ...listed.courses
          .filter((course) => [...course.content, ...course.study_plan].some((link) => renamed.has(link)))
          .map((course) => ({
            path: course.path,
            what: `the links of ${course.id}`,
            apply: () => writeFileSync(path.join(root, course.path), renderCourse({ ...course, content: follow(course.content), study_plan: follow(course.study_plan) })),
          })),
      ];
    });

    return { api };
  },
};

export default entry;
