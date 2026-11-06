# Quizzes for Eidos MD

Build multiple-choice quizzes on your project's content, take them locally to practice or officially for the record, and keep every score over time. A plugin for [Eidos MD](https://eidosmd.com) from The Virtual Panda.

- **Build a quiz** from any blueprint, asset, or link. Your own AI agent generates the questions, you regenerate the ones you don't like, or you write them yourself. Each question has its answer and the reason why.
- **Open it when it's ready.** A new quiz starts closed, and you can try it out before opening it to everyone.
- **Group quizzes into courses**, in order, or keep a quiz as a one-off.
- **Practice locally, then take it officially.** Practice stays on your machine. An official attempt is committed with the project and kept in your history.
- **See your scores over time**, and how you compare with the quiz's average. The quiz's creator, the proctors they add, and the project's owners see everyone's results, down to each answer.
- **Add a study plan if you want one.** `/study-plan` has your agent write reading sessions for a book, a textbook, or online content, as ordinary blueprints in your project.

Scoring runs on good faith. What each person is shown is a soft permission, not security: the answer key and committed results are files anyone with the project can read.

## Install

In Eidos MD, open **Community plugins**, find **Quizzes** under Browse, and install it. From the shell:

```bash
eidos plugin install @The-Virtual-Panda/quizzes
eidos plugin enable quizzes
eidos plugin allow quizzes
```

## Where things live

| What                             | Where                                     | Shared?           |
| -------------------------------- | ----------------------------------------- | ----------------- |
| One-off quizzes                  | `quizzes/<title>.md`                      | Committed         |
| A course and its quizzes         | `quizzes/<course>/`                       | Committed         |
| Official attempts                | `.eidos/plugins/quizzes/results/<alias>/` | Committed         |
| Practice attempts                | `.eidos/plugins/quizzes/local/`           | This machine only |
| Lessons, wiki pages, study plans | Your project's own collections            | Yours             |

A quiz is a markdown file you can read and edit by hand. `eidos quizzes --help` lists the commands, and `eidos instructions quizzes` is the guide your agent follows.

## Develop

The source is at [The-Virtual-Panda/eidos-quizzes](https://github.com/The-Virtual-Panda/eidos-quizzes). A checkout builds against an `eidosmd` checkout beside it (`../eidosmd/cli`).

```bash
pnpm install
pnpm test
pnpm dev
```

`eidos plugin dev dist` serves the plugin in a sandbox project that touches none of your own.
