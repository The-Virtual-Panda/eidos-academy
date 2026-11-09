# Academy for Eidos MD

Build quizzes and flashcard decks on your project's content. Take a quiz to practice or officially for the record, study a deck whenever you like, and follow your progress over time. A plugin for [Eidos MD](https://eidosmd.com) from The Virtual Panda.

- **Get started in a few steps.** A project with nothing in it yet opens on a short tutorial that makes your first quiz, deck, or course.
- **Build a quiz** from any blueprint, asset, or link. Your own AI agent generates the questions, you regenerate the ones you don't like, or you write them yourself. Each question has its answer and the reason why.
- **Build a deck of flashcards** the same ways, or make one from a quiz you already have: each question becomes a card, with its answer and why on the back.
- **Study at your own pace.** Flip a card, answer Got it or Still learning, and a card is learned once you get it twice in a row. Each session brings the cards you are still learning first, then new ones, then the learned ones you studied longest ago. Nothing comes due, and nothing nags you.
- **Keep studying** shows every deck with how many cards you have learned and when you last studied it, and studies across all of them at once.
- **Open as soon as it has a question or a card.** You can close a quiz or a deck to keep working on it, trying it out yourself meanwhile.
- **Group quizzes and decks into courses**, in one order, or keep either as a one-off.
- **Enroll in a course** to follow your progress across it: which quizzes you have taken and every score. Anyone can enroll, a course's creator and proctors too, and the people who run a course see how everyone enrolled is doing.
- **Practice locally, then take it officially.** Practice stays on your machine. An official attempt is committed with the project and kept in your history, and so are your sessions with a deck, so your progress follows you to any machine.
- **See your scores over time**, and how you compare with a quiz's average. A quiz's creator, the proctors they add, and the project's owners see everyone's results, down to each answer. Where you stand in a deck is yours alone.
- **Add a study plan if you want one.** `/study-plan` has your agent write reading sessions for a book, a textbook, or online content, as ordinary blueprints in your project.

Scoring runs on good faith. What each person is shown is a soft permission, not security: the answer key and committed results are files anyone with the project can read.

## Install

In Eidos MD, open **Community plugins**, find **Academy** under Browse, and install it. From the shell:

```bash
eidos plugin install @The-Virtual-Panda/academy
eidos plugin enable academy
eidos plugin allow academy
```

### Coming from Quizzes

Academy was called Quizzes before 0.3.0. In a project that used Quizzes, Academy offers to bring everything in from its list, or from the shell:

```bash
eidos academy move-quizzes --dry-run
eidos academy move-quizzes
```

Every quiz, course, result, and enrollment moves over with the same ids. The move then names the framework command that removes the empty old folder, and `eidos plugin disable quizzes` switches the old plugin off.

## Where things live

| What                                          | Where                                     | Shared?           |
| --------------------------------------------- | ----------------------------------------- | ----------------- |
| One-off quizzes and decks                     | `academy/<title>.md`                      | Committed         |
| A course and its quizzes and decks            | `academy/<course>/`                       | Committed         |
| Official attempts, deck sessions, enrollments | `.eidos/plugins/academy/results/<alias>/` | Committed         |
| Practice attempts, sessions with no name      | `.eidos/plugins/academy/local/`           | This machine only |
| Lessons, wiki pages, study plans              | Your project's own collections            | Yours             |

A quiz and a deck are markdown files you can read and edit by hand. `eidos academy --help` lists the commands, and `eidos instructions academy` is the guide your agent follows.

## Develop

The source is at [The-Virtual-Panda/eidos-academy](https://github.com/The-Virtual-Panda/eidos-academy). A checkout builds against an `eidosmd` checkout beside it (`../eidosmd/cli`).

```bash
pnpm install
pnpm test
pnpm dev
```

`eidos plugin dev dist` serves the plugin in a sandbox project that touches none of your own.
