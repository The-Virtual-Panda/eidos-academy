## Quizzes (a community plugin)

Quizzes builds multiple-choice quizzes on a project's content. A person takes a quiz as practice (local, on this machine alone) or as an official attempt (shared, committed, and kept in their history). A quiz stands alone or sits, in order, in a course. Scoring runs on good faith: the answer key is readable, and the plugin stores results rather than policing them.

### Where things are

- `quizzes/` (the folder the framework declares as `@quizzes/quizzes`): a one-off quiz is a file directly in it. A course is a folder holding `course.md` and its quizzes. Never move, rename, or delete these by hand; use the commands.
- `.eidos/plugins/quizzes/results/<alias>/`: official attempts, one file each, and `sessions.yaml`, the study sessions that person finished. Never write these.
- `.eidos/plugins/quizzes/local/`: practice attempts on this machine. Never committed.
- A project's content (lessons, wiki pages, study plans) is never in any of these. It stays blueprints and assets in the project.

### Writing a quiz

The CLI owns the file; the conversation owns the words.

```bash
eidos quizzes list [--json]
eidos quizzes new "<Title>" --draws-from <blueprint id, asset path, or link> [--course <id>] [--place <n>] [--created-by <alias>] [--json]
eidos quizzes question add <quiz> --prompt "<text>" --option "<text>" --option "<text>" --answer <n> --why "<text>" [--reference "<text>"] [--json]
eidos quizzes question set <quiz> <question> [--prompt ...] [--option ...] [--answer <n>] [--why ...] [--reference ...] [--regenerated] [--json]
eidos quizzes question remove <quiz> <question>
eidos quizzes show <quiz> [--json]
eidos quizzes set <quiz> [--title ...] [--add-source ...] [--remove-source ...] [--course <id>|""] [--place <n>] [--created-by <alias>] [--add-proctor <alias>] [--remove-proctor <alias>]
```

When you generate questions:

- Read the content the quiz draws from, all of it, and base every question strictly on it. Where it misspeaks (a garbled number or reference), follow what the author clearly meant.
- A question has two to five options, four unless it is true or false, and exactly one is right. `--answer` is the right option's number, from 1.
- Vary the position of the right answer. Make wrong options plausible, and keep every option parallel in length, detail, and format, so the right one is never the longest, the most specific, or the only one with exact references.
- Mix recall (facts, outlines, references) with understanding (why something matters).
- Always give `--why`: it is shown the moment a person answers.
- Replacing a question with a different one, use `question set --regenerated`: it takes a new id and counts as not yet seen. Past attempts keep their copy of the old one.
- `--created-by` is the person you are working for, never yourself.

A new quiz starts closed: nobody can take it officially until someone who edits it opens it (`eidos quizzes set <quiz> --status open`), and they can try it out as practice meanwhile. Leave it closed when you finish writing, and tell the person it is ready to open. `eidos quizzes new --open` is for a person who asks for it open.

### Courses

```bash
eidos quizzes course list [--json]
eidos quizzes course new "<Title>" [--description ...] [--content <link>] [--study-plan <link>] [--created-by <alias>]
eidos quizzes course show <course> [--json]
eidos quizzes course set <course> [--title ...] [--add-content ...] [--add-study-plan ...] [--created-by <alias>]
eidos quizzes course remove <course>
```

A link is a collection (`study-plans`), a category (`study-plans/old-testament`), or a blueprint id. The order in a course suggests a path and locks nothing. Removing a course leaves its quizzes as one-offs.

### Writing a study plan

A study plan is optional: never make one a condition of a quiz. Each session is an ordinary blueprint, the project's own, with its reading and three sections: **Focus**, **Look for**, and **Reflection**. It works for a book, a textbook, or online content.

1. Read the content.
2. Say where the sessions should go, and wait for the person to choose. Recommend a Study Plans collection with one category per course, and a one-off's plan at the collection's root. Offer a collection they already have, or no study plan at all.
3. Adding the collection is a framework change, so show the plan (`eidos configure:collection add ... --dry-run`, with `configure:category` and `configure:variant` beside it) and run it with `--yes` only once the person accepts. Read `eidos instructions configuring` first. If the commands refuse because the person is not a framework editor, say so, and whether to become one is theirs. Everything can be changed afterward, and the plugin never owns or manages this collection.
4. Write the sessions with `eidos new`. A course's sessions share one category, so name them in sequence: `Lesson 10 Session 01`.
5. Link the plan to its course: `eidos quizzes course set <course> --add-study-plan <collection/category>`.

A finished session is recorded per person with `eidos quizzes session done <blueprint>`, never in the session's file.

### Results

`eidos quizzes results <quiz> [--json]` shows what the page would show the person acting: their own attempts and the quiz's totals, or everyone's for the quiz's creator, its proctors, and the project's owners. With no user selected, or in a project with no owner marked, everyone counts as an owner, and a quiz or a course whose creator is unknown is anyone's to manage. That is a soft permission. It decides what is drawn, and the files stay readable, so never call results private. Only people take quizzes: an agent has no attempts and no scores, so never write an attempt.
