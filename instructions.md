## Academy (a community plugin)

Academy builds quizzes and flashcard decks on a project's content. A person takes a quiz as practice (local, on this machine alone) or as an official attempt (shared, committed, and kept in their history), and studies a deck a little at a time, whenever they like. Quizzes and decks stand alone or sit, in order, in a course. Scoring runs on good faith: the answer key is readable, and the plugin stores results rather than policing them. Academy was called Quizzes before 0.3.0.

### Where things are

- `academy/` (the folder the framework declares as `@academy/academy`): a one-off quiz or deck is a file directly in it, a deck marked `type: deck`. A course is a folder holding `course.md` and its quizzes and decks. Never move, rename, or delete these by hand; use the commands.
- `.eidos/plugins/academy/results/<alias>/`: official attempts, one file each; `reviews/`, the person's sessions with decks, one file each; `sessions.yaml`, the study plan sessions they finished; and `enrollments.yaml`, the courses they are in. Never write these.
- `.eidos/plugins/academy/local/`: practice attempts, and the deck sessions of nobody in particular, on this machine. Never committed.
- A project's content (lessons, wiki pages, study plans) is never in any of these. It stays blueprints and assets in the project.

### Writing a quiz

The CLI owns the file; the conversation owns the words.

```bash
eidos academy list [--json]
eidos academy quiz new "<Title>" --draws-from <blueprint id, asset path, or link> [--course <id>] [--place <n>] [--created-by <alias>] [--closed] [--json]
eidos academy question add <quiz> [--type <type>] --prompt "<text>" <its answer> --why "<text>" [--context "<text>"] [--image <asset>] [--points <n>] [--reference <ref>] [--json]
eidos academy question set <quiz> <question> [--type ...] [--prompt ...] [<its answer>] [--why ...] [--context ...] [--image ...] [--points <n>] [--reference ...] [--regenerated] [--json]
eidos academy question remove <quiz> <question>
eidos academy quiz show <quiz> [--json]
eidos academy quiz set <quiz> [--title ...] [--add-source ...] [--remove-source ...] [--course <id>|""] [--place <n>] [--created-by <alias>] [--add-proctor <alias>] [--remove-proctor <alias>] [--shuffle-questions on|off] [--shuffle-options on|off]
```

A question is one of seven types, each with its own answer:

| `--type`                    | Its answer                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `multiple-choice` (default) | `--option` two to five times, `--answer <n>` for the one right option                    |
| `true-or-false`             | `--answer True` or `--answer False`                                                      |
| `check-all`                 | `--option` two to eight times, `--answer <n>` for each true one                          |
| `short-answer`              | `--accept "<text>"` for each accepted answer                                             |
| `put-in-order`              | `--item "<text>"` two to eight times, in their right order                               |
| `match`                     | `--pair "<left> -> <right>"` two to eight times                                          |
| `written-answer`            | `--model "<text>"`, the model answer, and `--covers "<text>"`, what a full answer covers |

`--answer` is an option's number, from 1. Every type but a written answer takes `--why`. `--points` is 1 unless set: give more only to a question worth more, a written answer most often. `--context` is shown under the prompt while it is answered (a passage, a hint, or more about what it asks). `--reference` links to where the answer comes from: a blueprint id, with `#<section heading>` or not, an asset path, or a link.

When you generate questions:

- Read the content the quiz draws from, all of it, and base every question strictly on it. Where it misspeaks (a garbled number or reference), follow what the author clearly meant.
- Use multiple choice unless the person asks for other types. A multiple-choice question has four options unless it has a reason for fewer.
- Vary the position of the right answer. Make wrong options plausible, and keep every option parallel in length, detail, and format, so the right one is never the longest, the most specific, or the only one with exact references.
- A short answer accepts every way of writing the one answer (a name with and without its title, a common spelling); capitals, spacing, and end punctuation never matter.
- Check all that are true, put in order, and match count only when all of it is right, so keep them to what the content states plainly.
- A written answer's model answer is a full answer in a few sentences, and what a full answer covers is the points a grader looks for, one a line.
- Mix recall (facts, outlines, references) with understanding (why something matters).
- Always give `--why`: it is shown the moment a person answers.
- Replacing a question with a different one, use `question set --regenerated`: it takes a new id and counts as not yet seen. Past attempts keep their copy of the old one.
- `--created-by` is the person you are working for, never yourself.

A quiz is open by default as soon as it has a question, so someone could start it while you are still writing. When you write more than one question, keep it closed while you do: start it with `eidos academy quiz new --closed` (on a quiz that already exists, `eidos academy quiz set <quiz> --status closed`), then run `eidos academy quiz set <quiz> --status open` after the last question. A quiz the person closed stays closed unless they ask you to open it. Closed, a quiz takes no official attempts, and those who edit it can try it out as practice.

### Writing a deck

```bash
eidos academy deck new "<Title>" --draws-from <blueprint id, asset path, or link> [--from-quiz <quiz>] [--course <id>] [--place <n>] [--created-by <alias>] [--closed] [--json]
eidos academy card add <deck> --front "<text>" --back "<text>" [--reference "<text>"] [--json]
eidos academy card set <deck> <card> [--front ...] [--back ...] [--reference ...] [--regenerated] [--json]
eidos academy card remove <deck> <card>
eidos academy deck show <deck> [--json]
eidos academy deck set <deck> [--title ...] [--add-source ...] [--remove-source ...] [--course <id>|""] [--place <n>] [--per-session <n>] [--add-from-quiz <quiz>] [--created-by <alias>] [--add-proctor <alias>] [--remove-proctor <alias>] [--status open|closed]
```

`--from-quiz` makes a deck's first cards from a quiz's questions, the question on the front and the answer with why it is right on the back; `--add-from-quiz` adds a quiz's questions to a deck that exists, skipping any it has. When you write cards:

- Read the content the deck draws from, all of it, and base every card strictly on it.
- One fact a card. The front is a short question or prompt; the back answers it in a sentence or two that stand on their own, without the front.
- Prefer what is worth remembering: names, terms and what they mean, outlines, references, and why something matters. Leave out what only makes sense next to a page.
- Give `--reference` when the content says where the fact comes from.
- Replacing a card with a different one, use `card set --regenerated`: it takes a new id and counts as not yet seen. Past study sessions keep their copy of the old one.
- `--created-by` is the person you are working for, never yourself.

Keep a deck closed while you write more than one card, as for a quiz: `--closed` on `deck new` (or `deck set <deck> --status closed`), then `deck set <deck> --status open` after the last card.

People study decks on the page. A card is learned once a person answers Got it twice in a row, and Academy keeps when they studied, never when they should study next: there are no due dates, and never suggest one. Only people study, so never write a study session.

### Courses

```bash
eidos academy course list [--json]
eidos academy course new "<Title>" [--description ...] [--content <link>] [--study-plan <link>] [--created-by <alias>]
eidos academy course show <course> [--json]
eidos academy course set <course> [--title ...] [--add-content ...] [--add-study-plan ...] [--created-by <alias>]
eidos academy course remove <course>
```

A course holds quizzes and decks in one order. A link is a collection (`study-plans`), a category (`study-plans/old-testament`), or a blueprint id. The order suggests a path and locks nothing. Removing a course leaves its quizzes and decks as one-offs.

A person enrolls in a course to follow their progress across it. Anyone may, a course's creator and its proctors too, and nobody needs to enroll to take a quiz or study a deck. Only people enroll, so never enroll yourself.

```bash
eidos academy course enroll <course> [--json]
eidos academy course leave <course> [--json]
eidos academy course progress <course> [--person <alias>] [--json]
eidos academy course people <course> [--json]
```

`progress` shows an enrolled person's quizzes and scores: the person acting's own, or anyone's for the course's creator, the creators and proctors of its quizzes, and the project's owners, who alone get `people`, the list of everyone enrolled. Leaving a course keeps every result.

### Writing a study plan

A study plan is optional: never make one a condition of a quiz or a deck. Each session is an ordinary blueprint, the project's own, with its reading and three sections: **Focus**, **Look for**, and **Reflection**. It works for a book, a textbook, or online content.

1. Read the content.
2. Say where the sessions should go, and wait for the person to choose. Recommend a Study Plans collection with one category per course, and a one-off's plan at the collection's root. Offer a collection they already have, or no study plan at all.
3. Adding the collection is a framework change, so show the plan (`eidos configure:collection add ... --dry-run`, with `configure:category` and `configure:variant` beside it) and run it with `--yes` only once the person accepts. Read `eidos instructions configuring` first. If the commands refuse because the person is not a framework editor, say so, and whether to become one is theirs. Everything can be changed afterward, and the plugin never owns or manages this collection.
4. Write the sessions with `eidos new`. A course's sessions share one category, so name them in sequence: `Lesson 10 Session 01`.
5. Link the plan to its course: `eidos academy course set <course> --add-study-plan <collection/category>`.

A finished session is recorded per person with `eidos academy session done <blueprint>`, never in the session's file.

### Results

`eidos academy quiz results <quiz> [--json]` shows what the page would show the person acting: their own attempts and the quiz's totals, or everyone's for the quiz's creator, its proctors, and the project's owners. With no user selected, or in a project with no owner marked, everyone counts as an owner, and a quiz, deck, or course whose creator is unknown is anyone's to manage. That is a soft permission. It decides what is drawn, and the files stay readable, so never call results private. Only people take quizzes: an agent has no attempts and no scores, so never write an attempt. A deck has no results at all: where a person stands in it is theirs alone.

### Grading written answers

A written answer in an official attempt waits for a grade, and the attempt counts in no best, average, or comparison until every one is graded. The quiz's creator, its proctors, and the project's owners grade them, on the quiz's To grade tab or with:

```bash
eidos academy grade list <quiz> [--json]
eidos academy grade add <quiz> <attempt> <question> --points <n> [--note "<text>"] [--ai] [--suggestion] [--for <alias>] [--json]
```

You grade only when a person who grades the quiz asks you to, and for them: pass `--for <their alias>` and `--ai`, and `--suggestion` unless they asked for your grades to count without review. Grade each answer against its question's model answer and what a full answer covers, out of its points, on what the person wrote alone, and leave a short, kind note saying what a full answer has that theirs does not. The latest grade counts, and the grader can change any. In practice, a person marks their own written answer, so never grade a practice attempt.

### From Quizzes

A project that used Quizzes before 0.3.0 still has its quizzes in that plugin's folder and its results under `.eidos/plugins/quizzes/`, and `eidos check` says so. `eidos academy move-quizzes --dry-run` says what would move; `eidos academy move-quizzes` moves it, for a project owner, and prints the framework command that takes out the old folder's entry. Ask the person before you run either.
