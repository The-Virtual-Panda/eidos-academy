// Academy's CLI entry, what every host loads: `eidos academy`, the check's findings on the
// plugin's files, and ids following a blueprint that takes a new one. The agent writes a quiz
// and a deck with these commands, as the page does; the words of a question or a card are the
// conversation's.
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { HostError, type CliEntry, type Host } from 'eidosmd/plugin';
import { makeApi } from './api.ts';
import { askable, cardProblems, compare, questionProblems, renderCourse, renderDeck, renderQuiz, studiable, type Card, type Question } from './model.ts';

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

function checkedCard(card: Card): Card {
  const problems = cardProblems(card);
  if (problems.length > 0) throw new HostError(400, `this card can't be saved: ${problems.join('; ')}`);
  return card;
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

    host.command((academy) => {
      academy.description("quizzes and flashcard decks on the project's content: build them, group them into courses, and follow how people are doing");

      academy
        .command('list')
        .description('every quiz and deck, with its course and place, what it draws from, and where you stand in it')
        .option('--json', '{ me, folder, quizzes[], decks[], courses[], quizzes_left }')
        .action(async (_options: unknown, command: Options) => {
          await run(command, (json) => {
            const overview = api.overview();
            const where = (row: { course_title: string | null; place: number | null }): string => (row.course_title ? `${row.course_title} ${row.place}` : 'one-off');
            const lines = [
              ...overview.quizzes.map((row) => `${row.id}  quiz  ${row.title}  ·  ${where(row)}  ·  ${row.status === 'closed' ? 'closed  ·  ' : ''}${row.questions} questions  ·  best ${asPercent(row.best)}`),
              ...overview.decks.map((row) => `${row.id}  deck  ${row.title}  ·  ${where(row)}  ·  ${row.status === 'closed' ? 'closed  ·  ' : ''}${row.cards} cards  ·  ${row.learned} learned`),
            ];
            const left = overview.quizzes_left ? `\n\nQuizzes left ${overview.quizzes_left.quizzes} quizzes and ${overview.quizzes_left.results} result files here; eidos academy move-quizzes brings them into Academy` : '';
            say(json, overview, (lines.join('\n') || 'nothing yet; eidos academy quiz new "<Title>" or eidos academy deck new "<Title>" starts one') + left);
          });
        });

      const quizzes = academy.command('quiz').description('build a quiz, change it, or read its results');

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
        .description('start a quiz; add its questions with eidos academy question add')
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

      const question = academy.command('question').description("add, change, or remove a quiz's questions");
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

      // ---- decks and their cards ----

      const deck = academy.command('deck').description('build a deck of flashcards, change it, or see where you stand in it');
      deck
        .command('show')
        .argument('<deck>', "the deck's id")
        .description('one deck, with its cards and where you stand in it')
        .option('--json', '{ deck, progress, standings, ... }')
        .action(async (id: string, _options: unknown, command: Options) => {
          await run(command, (json) => {
            const shown = api.deck(id);
            const { progress } = shown;
            say(json, shown, `${renderDeck(shown.deck).trimEnd()}\n\nYou: ${progress.learned} of ${progress.of} learned, ${progress.learning} still learning, ${progress.new} not yet seen`);
          });
        });
      deck
        .command('new')
        .argument('<title>', "the deck's title")
        .description('start a deck; add its cards with eidos academy card add, or make them from a quiz')
        .option('--draws-from <source>', 'a blueprint id, an asset path, or a link (repeatable)', collect, [] as string[])
        .option('--from-quiz <quiz>', "make its first cards from a quiz's questions: the prompt on the front, the answer and why on the back")
        .option('--course <course>', "the course's id; absent, the quiz's course with --from-quiz, else a one-off")
        .option('--place <n>', 'its place in the course, from 1; absent, last')
        .option('--created-by <alias>', 'who created it; absent, you')
        .option('--closed', 'keep it closed until someone opens it; absent, it opens as soon as it has a card')
        .option('--json', 'the deck')
        .action(async (title: string, options: { drawsFrom: string[]; fromQuiz?: string; course?: string; place?: string; createdBy?: string; closed?: boolean }, command: Options) => {
          await run(command, async (json) => {
            let made = await api.createDeck({
              title,
              draws_from: options.drawsFrom,
              course: options.course ? store.course(options.course).id : null,
              place: options.place ? Number(options.place) : null,
              from_quiz: options.fromQuiz ?? null,
            });
            if (options.createdBy || options.closed) {
              made = { ...made, ...(options.createdBy ? { created_by: options.createdBy } : {}), ...(options.closed ? { closed: true } : {}) };
              await store.saveDeck(made);
              made = store.deck(made.id);
            }
            say(json, made, `started ${made.id}  ${made.path}${made.cards.length > 0 ? `  ·  ${made.cards.length} cards from ${made.made_from}` : ''}`);
          });
        });
      deck
        .command('set')
        .argument('<deck>', "the deck's id")
        .description("change a deck's title, sources, course, place, size of a session, creator, or editors")
        .option('--status <status>', 'open or closed')
        .option('--title <title>', 'its title')
        .option('--add-source <source>', 'a blueprint id, an asset path, or a link to draw from (repeatable)', collect, [] as string[])
        .option('--remove-source <source>', 'stop drawing from it (repeatable)', collect, [] as string[])
        .option('--course <course>', 'move it into this course; "" makes it a one-off')
        .option('--place <n>', 'its place in its course, from 1')
        .option('--per-session <n>', 'how many cards Study takes at a time (20 unless set)')
        .option('--created-by <alias>', 'hand it to another creator')
        .option('--add-proctor <alias>', 'someone else who may edit it (repeatable)', collect, [] as string[])
        .option('--remove-proctor <alias>', 'no longer edits it (repeatable)', collect, [] as string[])
        .option('--add-from-quiz <quiz>', "add a quiz's questions as cards, skipping the ones the deck has")
        .option('--json', 'the deck')
        .action(
          async (
            id: string,
            options: { status?: string; title?: string; addSource: string[]; removeSource: string[]; course?: string; place?: string; perSession?: string; createdBy?: string; addProctor: string[]; removeProctor: string[]; addFromQuiz?: string },
            command: Options,
          ) => {
            await run(command, async (json) => {
              let held = store.deck(id);
              if (options.status !== undefined && options.status !== 'open' && options.status !== 'closed') throw new HostError(400, '--status is open or closed');
              if (options.addFromQuiz) held = (await api.cardsFromQuiz(held.id, options.addFromQuiz)).deck;
              if (options.status === 'open' && studiable(held).length === 0) throw new HostError(400, 'add a card before opening this deck');
              if (options.course !== undefined) held = await store.moveDeck(held.id, options.course === '' ? null : store.course(options.course).id);
              const known = new Set(store.people().map((person) => person.alias));
              for (const alias of options.addProctor) if (!known.has(alias)) throw new HostError(400, `${alias} is not in the project's users; eidos users lists them`);
              const size = options.perSession === undefined ? held.per_session : Number(options.perSession);
              if (!Number.isInteger(size) || size < 1 || size > 500) throw new HostError(400, '--per-session is 1 to 500 cards');
              await store.saveDeck({
                ...held,
                per_session: size,
                ...(options.status ? { closed: options.status === 'closed' } : {}),
                ...(options.title ? { title: options.title } : {}),
                ...(options.createdBy ? { created_by: options.createdBy } : {}),
                draws_from: [...new Set([...held.draws_from.filter((source) => !options.removeSource.includes(source)), ...options.addSource])],
                proctors: [...new Set([...held.proctors.filter((alias) => !options.removeProctor.includes(alias)), ...options.addProctor])],
              });
              if (options.place) await store.place(held.id, Number(options.place));
              const saved = store.deck(held.id);
              say(json, saved, `changed ${saved.id}  ${saved.path}`);
            });
          },
        );
      deck
        .command('remove')
        .argument('<deck>', "the deck's id")
        .description("delete a deck; people's study sessions with it stay in their history")
        .option('--json', '{ removed }')
        .action(async (id: string, _options: unknown, command: Options) => {
          await run(command, (json) => {
            const removed = store.removeDeck(id);
            say(json, { removed: removed.id }, `removed ${removed.id}`);
          });
        });

      const card = academy.command('card').description("add, change, or remove a deck's cards");
      const cardFlags = (command: ReturnType<typeof card.command>) =>
        command.option('--front <text>', 'what is shown first').option('--back <text>', 'the answer').option('--reference <text>', 'where it comes from').option('--json', 'the card');
      cardFlags(card.command('add').argument('<deck>', "the deck's id").description('add a card to the end of a deck')).action(
        async (id: string, options: { front?: string; back?: string; reference?: string }, command: Options) => {
          await run(command, async (json) => {
            const held = store.deck(id);
            const added = checkedCard({ id: store.newCardId(held), front: options.front ?? '', back: options.back ?? '', reference: options.reference ?? '' });
            await store.saveDeck({ ...held, cards: [...held.cards, added] });
            say(json, added, `added ${added.id} to ${held.id}`);
          });
        },
      );
      cardFlags(
        card
          .command('set')
          .argument('<deck>', "the deck's id")
          .argument('<card>', "the card's id")
          .description('change a card; it keeps its id, and where everyone stands with it, unless --regenerated')
          .option('--regenerated', 'a new card in its place: it takes a new id and counts as not yet seen'),
      ).action(async (id: string, cardId: string, options: { front?: string; back?: string; reference?: string; regenerated?: boolean }, command: Options) => {
        await run(command, async (json) => {
          const held = store.deck(id);
          const at = held.cards.findIndex((one) => one.id === cardId);
          const was = held.cards[at];
          if (!was) throw new HostError(404, `${held.id} has no card ${cardId}`);
          const changed = checkedCard({
            id: options.regenerated ? store.newCardId(held) : was.id,
            front: options.front ?? was.front,
            back: options.back ?? was.back,
            reference: options.reference ?? was.reference,
          });
          const cards = [...held.cards];
          cards[at] = changed;
          await store.saveDeck({ ...held, cards });
          say(json, changed, `changed ${changed.id} in ${held.id}`);
        });
      });
      card
        .command('remove')
        .argument('<deck>', "the deck's id")
        .argument('<card>', "the card's id")
        .description('take a card out; past study sessions keep their copy of it')
        .option('--json', '{ removed }')
        .action(async (id: string, cardId: string, _options: unknown, command: Options) => {
          await run(command, async (json) => {
            const held = store.deck(id);
            if (!held.cards.some((one) => one.id === cardId)) throw new HostError(404, `${held.id} has no card ${cardId}`);
            await store.saveDeck({ ...held, cards: held.cards.filter((one) => one.id !== cardId) });
            say(json, { removed: cardId }, `removed ${cardId} from ${held.id}`);
          });
        });

      const course = academy.command('course').description('group quizzes and decks into ordered courses');
      course
        .command('list')
        .description('every course')
        .option('--json', '{ courses[] }')
        .action(async (_options: unknown, command: Options) => {
          await run(command, (json) => {
            const { courses } = store.list();
            say(
              json,
              { courses },
              courses.map((held) => `${held.id}  ${held.title}  ·  ${store.inCourse(held.id).length} quizzes and decks`).join('\n') ||
                'no courses yet; eidos academy course new "<Title>" starts one',
            );
          });
        });
      course
        .command('show')
        .argument('<course>', "the course's id")
        .description('one course, with its quizzes and decks in order and your progress')
        .option('--json', '{ course, enrolled_since, quizzes[], decks[], items[], progress, content[], sessions[] }')
        .action(async (id: string, _options: unknown, command: Options) => {
          await run(command, (json) => {
            const shown = api.course(id);
            const lines = shown.items.map((placed) =>
              placed.kind === 'quiz'
                ? `${placed.row.place}. ${placed.row.id}  quiz  ${placed.row.title}  ·  best ${asPercent(placed.row.best)}`
                : `${placed.row.place}. ${placed.row.id}  deck  ${placed.row.title}  ·  ${placed.row.learned} of ${placed.row.cards} learned`,
            );
            say(json, shown, [renderCourse(shown.course).trimEnd(), '', ...lines].join('\n'));
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
        .description('delete a course; its quizzes and decks stay, as one-offs')
        .option('--json', '{ removed, quizzes, decks }')
        .action(async (id: string, _options: unknown, command: Options) => {
          await run(command, async (json) => {
            const removed = await store.removeCourse(id);
            say(json, { removed: removed.course.id, quizzes: removed.quizzes, decks: removed.decks }, `removed ${removed.course.id}; ${removed.quizzes} quizzes and ${removed.decks} decks are one-offs now`);
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

      const session = academy.command('session').description("mark a study plan's session done or not, for you, never in its file");
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

      academy
        .command('move-quizzes')
        .description('bring in what the Quizzes plugin, Academy\'s name before 0.3.0, left in this project: its quizzes, courses, results, and practice')
        .option('--dry-run', 'say what would move, and move nothing')
        .option('--json', '{ quizzes, courses, results, folder, then[] }')
        .action(async (options: { dryRun?: boolean }, command: Options) => {
          await run(command, (json) => {
            const left = store.quizzesLeft();
            if (left.files.length + left.results.length === 0) {
              say(json, { quizzes: 0, courses: 0, results: 0, folder: null, then: [] }, 'nothing from Quizzes is left in this project');
              return;
            }
            if (options.dryRun) {
              say(json, { ...left, dry_run: true }, `would move ${left.files.length} files from ${left.folder ?? 'nowhere'}/ into ${store.folderName()}/, and ${left.results.length} result and practice files into Academy's workspace`);
              return;
            }
            const moved = api.moveFromQuizzes();
            say(
              json,
              moved,
              [
                `moved ${moved.quizzes} quizzes and ${moved.courses} courses into ${store.folderName()}/, and ${moved.results} result and practice files; every id stays`,
                ...(moved.then.length > 0 ? ['', 'Then, to finish:', ...moved.then.map((line) => `  ${line}`)] : []),
              ].join('\n'),
            );
          });
        });
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
      code: 'card',
      level: 'warning',
      run: () =>
        store.list().decks.flatMap((held) =>
          held.cards.flatMap((one) => {
            const problems = cardProblems(one);
            return problems.length > 0 ? [{ path: held.path, message: `card ${one.id}: ${problems.join('; ')}, so it is left out when the deck is studied` }] : [];
          }),
        ),
    });
    host.finding({
      code: 'quizzes-left',
      level: 'warning',
      run: () => {
        const left = store.quizzesLeft();
        if (left.files.length + left.results.length === 0) return [];
        return [{ path: left.folder ?? '.eidos/plugins/quizzes', message: `Quizzes, Academy's name before 0.3.0, left ${left.files.length} quizzes and courses and ${left.results.length} result files here; eidos academy move-quizzes brings them into Academy` }];
      },
    });
    host.finding({
      code: 'source-gone',
      level: 'warning',
      run: () => {
        const context = host.context();
        const ids = new Set(context.blueprints.map((blueprint) => blueprint.properties?.['id']));
        const listed = store.list();
        return [...listed.quizzes.map((held) => ({ held, what: 'quiz' })), ...listed.decks.map((held) => ({ held, what: 'deck' }))].flatMap(({ held, what }) =>
          held.draws_from.flatMap((source) => {
            if (/^[a-z]+:\/\//i.test(source)) return [];
            const found = source.includes('/') ? existsSync(path.join(context.root, source)) : ids.has(source);
            return found ? [] : [{ path: held.path, message: `this ${what} draws from ${source}, which is gone` }];
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
        ...listed.decks
          .filter((held) => held.draws_from.some((source) => renamed.has(source)))
          .map((held) => ({
            path: held.path,
            what: `what ${held.id} draws from`,
            apply: () => writeFileSync(path.join(root, held.path), renderDeck({ ...held, draws_from: follow(held.draws_from) })),
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
