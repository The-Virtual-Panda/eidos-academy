// guest.js: a quiz taken from a public link (Academy REQ69 to REQ71), drawn in the sandboxed frame Eidos runs it in, under
// Eidos's bar (Plugin Share Links REQ14). It has no network, storage, or form of its own: it draws from the guest copy, checks
// each answer through Eidos against the key it never sees, and sends the attempt through Eidos. A guest's words, and every
// word of the guest copy, are drawn as text and never as markup.
import type { GuestDraw, GuestHost, GuestResult } from 'eidosmd/guest';
import { dragRow } from './drag.ts';
import type { GuestCopy, GuestQuestion, Shown } from './share.ts';

type Answer = number | number[] | string | string[];
interface Checked {
  question: GuestQuestion;
  answer: Answer;
  right: boolean | null;
  shown: Shown | null;
}

const TYPE_NAMES: Record<string, string> = {
  choice: 'Multiple choice',
  truefalse: 'True or false',
  all: 'Check all that are true',
  short: 'Short answer',
  order: 'Put in order',
  match: 'Match',
  written: 'Written answer',
};

const STYLE = `
:root { --accent: #a8492a; --accent-soft: #f3e2d9; --on-accent: #fff; --canvas: #faf8f4; --raised: #fff; --sunken: #f1ece3; --line: #e4ddd1;
  --line-strong: #cfc4b2; --fg: #15171b; --muted: #4a4f58; --faint: #6a717c; --ok: #2f6b3a; --err: #a3302a; --warn: #9a6a12; }
:root[data-theme="dark"] { --accent: #e08a63; --accent-soft: #3a2620; --on-accent: #101216; --canvas: #101216; --raised: #171a20; --sunken: #0b0d10;
  --line: #262a31; --line-strong: #343a43; --fg: #ece9e3; --muted: #9ba2ac; --faint: #8a919b; --ok: #7bc48a; --err: #e0756b; --warn: #d8a437; }
html, body { background: var(--canvas); }
.qg { box-sizing: border-box; max-width: 640px; margin: 0 auto; padding: 20px 18px 28px; color: var(--fg);
  font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.qg *, .qg *::before, .qg *::after { box-sizing: border-box; }
.qg h1 { margin: 0 0 8px; font-size: 26px; line-height: 1.2; letter-spacing: -.01em; }
.qg h2 { margin: 0 0 8px; font-size: 20px; line-height: 1.3; letter-spacing: -.01em; white-space: pre-line; }
.qg p { margin: 0 0 12px; }
.qg .eyebrow { color: var(--faint); font-size: 13px; margin: 0 0 4px; }
.qg .muted { color: var(--muted); } .qg .faint { color: var(--faint); font-size: 13px; }
.qg .context { color: var(--muted); white-space: pre-line; }
.qg .chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12.5px; }
.qg .chip { background: var(--sunken); border-radius: 99px; padding: 2px 10px; font-weight: 600; color: var(--muted); }
.qg .pos { margin-left: auto; background: var(--accent-soft); color: var(--accent); border-radius: 99px; padding: 2px 10px; font-weight: 700; }
.qg .track { height: 6px; background: var(--sunken); border-radius: 99px; margin: 10px 0 20px; overflow: hidden; }
.qg .track > div { height: 100%; background: var(--accent); border-radius: 99px; }
.qg img.picture { display: block; max-width: 100%; height: auto; border-radius: 10px; margin: 0 0 14px; }
.qg .option { display: flex; gap: 10px; align-items: center; width: 100%; min-height: 48px; margin: 0 0 8px; padding: 12px 14px; border: 1px solid var(--line-strong);
  border-radius: 12px; background: var(--raised); color: var(--fg); font: inherit; text-align: left; cursor: pointer; }
.qg .option:disabled { cursor: default; }
.qg .option.picked { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 1px var(--accent); }
.qg .option input { width: 18px; height: 18px; margin: 0; accent-color: var(--accent); flex: none; }
.qg .option.right { border-color: var(--ok); background: color-mix(in srgb, var(--ok) 12%, var(--raised)); }
.qg .option.wrong { border-color: var(--err); background: color-mix(in srgb, var(--err) 12%, var(--raised)); }
.qg label.field { display: block; font-weight: 600; margin: 16px 0 4px; }
.qg input.text, .qg textarea, .qg select { width: 100%; min-height: 46px; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: 10px;
  background: var(--raised); color: var(--fg); font: inherit; }
.qg textarea { min-height: 120px; resize: vertical; }
.qg .row { display: flex; gap: 8px; align-items: center; margin: 0 0 8px; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--raised); }
.qg .row > span { flex: 1; }
.qg .row.sortable { cursor: grab; user-select: none; } .qg .row.held { border-color: var(--accent); box-shadow: 0 8px 24px rgb(0 0 0 / .14); cursor: grabbing; }
.qg .row .grip { flex: none; padding: 4px 2px; color: var(--muted); font-size: 18px; font-weight: 400; line-height: 1; touch-action: none; cursor: grab; }
.qg .pair { margin: 0 0 12px; } .qg .pair > span { display: block; font-weight: 600; margin-bottom: 4px; }
.qg button.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 10px 22px; border: 1px solid var(--accent);
  border-radius: 99px; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 600; cursor: pointer; }
.qg button.btn:disabled { opacity: .45; cursor: default; }
.qg button.btn.block { display: flex; width: 100%; }
.qg button.quiet { border: 0; background: transparent; color: var(--muted); font: inherit; padding: 10px 4px; cursor: pointer; }
.qg button.small { min-height: 36px; min-width: 36px; padding: 4px 10px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--raised); color: var(--fg); font: inherit; cursor: pointer; }
.qg button.small:disabled { opacity: .35; cursor: default; }
.qg .feedback { border-left: 3px solid var(--ok); background: var(--raised); border-radius: 0 10px 10px 0; padding: 10px 12px; margin: 6px 0 16px; white-space: pre-line; }
.qg .feedback.wrong { border-left-color: var(--err); } .qg .feedback.wait { border-left-color: var(--warn); } .qg .feedback.problem { border-left-color: var(--warn); }
.qg .feedback a { color: var(--accent); } .qg .reference { display: block; color: var(--faint); font-size: 13px; margin-top: 6px; }
.qg .score { text-align: center; margin: 4px 0 2px; } .qg .score b { font-size: 64px; color: var(--accent); letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.qg .score span { font-size: 28px; font-weight: 700; margin-left: 6px; }
.qg .pill { display: inline-block; background: var(--accent-soft); color: var(--accent); border-radius: 99px; padding: 2px 12px; font-size: 13px; font-weight: 600; }
.qg .center { text-align: center; }
.qg ol.review { list-style: none; margin: 18px 0; padding: 0; }
.qg ol.review li { border-top: 1px solid var(--line); padding: 10px 0; }
.qg ol.review .mark { font-weight: 700; margin-right: 6px; } .qg .ok { color: var(--ok); } .qg .no { color: var(--err); } .qg .waits { color: var(--warn); }
.qg .detail { color: var(--muted); font-size: 13.5px; white-space: pre-line; }
.qg .gap { height: 12px; }
.qg :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`;

// An element with its text, never its markup.
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...children: Array<Node | string | null | false>): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name === 'class') node.className = value;
    else node.setAttribute(name, value);
  }
  for (const child of children) if (child !== null && child !== false) node.append(child);
  return node;
}
const button = (label: string, onClick: () => void, className = 'btn'): HTMLButtonElement => {
  const held = el('button', { class: className, type: 'button' }, label);
  held.addEventListener('click', onClick);
  return held;
};

const shuffled = <T>(values: T[]): T[] => {
  const out = [...values];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [out[index], out[other]] = [out[other]!, out[index]!];
  }
  return out;
};

function readCopy(text: string): GuestCopy | null {
  try {
    const held = JSON.parse(text) as GuestCopy;
    return held && held.academy === 1 && Array.isArray(held.questions) ? held : null;
  } catch {
    return null;
  }
}

const isShown = (value: unknown): value is Shown => typeof value === 'object' && value !== null && typeof (value as Shown).right === 'string';

// What Eidos said when it did not take an answer or an attempt, in words a guest can act on.
function problemOf(result: GuestResult): string {
  if (result.code === 'limit') return 'Too many were sent from here just now. Wait a few minutes and try again.';
  if (result.code === 'not-taking-responses') return 'This link is not taking answers.';
  if (result.code === 'too-large' || result.code === 'refused') return 'This is too large to send.';
  return "It didn't reach Eidos. Try again.";
}

const draw: GuestDraw<HTMLElement> = (root: HTMLElement, eidos: GuestHost) => {
  document.head.append(el('style', {}, STYLE));
  let copy = readCopy(eidos.guest);
  if (!copy) throw new Error('the guest copy is not an Academy quiz');
  eidos.changed((next) => {
    const read = readCopy(next);
    if (!read) return;
    copy = read;
    // a guest mid-quiz keeps the questions they started with; one who has not begun sees the quiz as it now stands
    if (stage === 'start') start();
  });

  let stage: 'start' | 'question' | 'result' = 'start';
  let name: string | null = null;
  let order: GuestQuestion[] = [];
  let at = 0;
  let checked: Checked[] = [];

  const show = (...children: Array<Node | null | false>): void => {
    root.replaceChildren(el('main', { class: 'qg' }, ...children));
    const focus = root.querySelector<HTMLElement>('[data-focus]');
    focus?.focus();
  };

  function start(): void {
    stage = 'start';
    const quiz = copy!;
    const points = quiz.questions.reduce((total, question) => total + question.points, 0);
    const about = el(
      'p',
      { class: 'muted' },
      `${quiz.questions.length} ${quiz.questions.length === 1 ? 'question' : 'questions'} · ${points} ${points === 1 ? 'point' : 'points'} · one question at a time, and each answer shows whether it is right as you give it.`,
    );
    if (quiz.questions.length === 0) {
      show(el('h1', { tabindex: '-1', 'data-focus': '' }, quiz.title), el('p', { class: 'muted' }, 'This quiz has no questions to ask yet.'));
      return;
    }
    const begin = button(
      'Begin',
      () => {
        name = input ? input.value.trim() || null : null;
        if (quiz.guest_name === 'required' && !name) return;
        order = quiz.shuffle_questions ? shuffled(quiz.questions) : [...quiz.questions];
        at = 0;
        checked = [];
        ask();
      },
      'btn block',
    );
    let input: HTMLInputElement | null = null;
    const parts: Array<Node | null> = [];
    if (quiz.guest_name !== 'none') {
      input = el('input', { class: 'text', id: 'qg-name', type: 'text', autocomplete: 'name', maxlength: '120', ...(name ? { value: name } : {}) });
      const required = quiz.guest_name === 'required';
      begin.disabled = required && !name;
      input.addEventListener('input', () => (begin.disabled = required && input!.value.trim() === ''));
      input.addEventListener('keydown', (event) => event.key === 'Enter' && !begin.disabled && begin.click());
      parts.push(
        el('label', { class: 'field', for: 'qg-name' }, required ? 'Your name' : 'Your name (optional)'),
        input,
        el('p', { class: 'faint' }, 'The team that shared this sees it beside your answers.'),
        el('div', { class: 'gap' }),
      );
    }
    show(quiz.course ? el('p', { class: 'eyebrow' }, quiz.course) : null, el('h1', { tabindex: '-1', 'data-focus': '' }, quiz.title), about, ...parts, begin);
    if (input) input.focus();
  }

  function ask(): void {
    stage = 'question';
    const question = order[at]!;
    const total = order.length;
    const head = el(
      'div',
      { class: 'chips' },
      el('span', { class: 'chip' }, TYPE_NAMES[question.type] ?? question.type),
      el('span', { class: 'chip' }, `${question.points} ${question.points === 1 ? 'point' : 'points'}`),
      el('span', { class: 'pos', 'aria-label': `Question ${at + 1} of ${total}` }, `${at + 1} / ${total}`),
    );
    const bar = el('div', { class: 'track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(at) });
    const fill = el('div');
    fill.style.width = `${Math.round((at / total) * 100)}%`;
    bar.append(fill);
    const prompt = el('h2', { tabindex: '-1', 'data-focus': '' }, question.prompt);
    const picture = question.image ? el('img', { class: 'picture', alt: '', src: `image/${encodeURIComponent(question.image)}` }) : null;
    const context = question.context.trim() ? el('p', { class: 'context' }, question.context) : null;
    const feedback = el('div', { 'aria-live': 'polite' });
    const after = el('div');
    const form = el('div');
    const answering = answerer(question, form, (answer) => void submitAnswer(question, answer, answering, feedback, after));
    show(head, bar, prompt, picture, context, form, feedback, after);
  }

  // The controls for one question, by its type; `send` is called with the answer once the guest gives it.
  function answerer(question: GuestQuestion, form: HTMLElement, send: (answer: Answer) => void): { lock: (shown: Shown | null, right: boolean | null, answer: Answer) => void; unlock: () => void } {
    const controls: Array<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = [];
    const lockAll = (): void => controls.forEach((control) => (control.disabled = true));
    const unlockAll = (): void => controls.forEach((control) => (control.disabled = false));
    if (question.type === 'choice' || question.type === 'truefalse') {
      const shown = copy!.shuffle_options && question.type === 'choice' ? shuffled(question.options.map((_, index) => index)) : question.options.map((_, index) => index);
      const buttons = new Map<number, HTMLButtonElement>();
      // a click picks an answer and Check answer gives it, so a guest can think it over before it counts
      let picked: number | null = null;
      const give = button('Check answer', () => {
        if (picked === null) return;
        lockAll();
        send(picked);
      });
      const pick = (index: number): void => {
        picked = index;
        for (const [at, option] of buttons) {
          option.classList.toggle('picked', at === index);
          option.setAttribute('aria-pressed', String(at === index));
        }
        give.disabled = false;
      };
      for (const index of shown) {
        const option = button(question.options[index] ?? '', () => pick(index), 'option');
        option.setAttribute('aria-pressed', 'false');
        buttons.set(index, option);
        controls.push(option);
        form.append(option);
      }
      give.disabled = true;
      controls.push(give);
      form.append(el('div', { class: 'gap' }), give);
      return {
        lock: (said, right, answer) => {
          lockAll();
          give.remove();
          for (const option of buttons.values()) option.classList.remove('picked');
          const chosen = buttons.get(answer as number);
          if (right !== null) chosen?.classList.add(right ? 'right' : 'wrong');
          if (right === false && said) for (const [index, option] of buttons) if ((question.options[index] ?? '').trim() === said.right) option.classList.add('right');
        },
        unlock: () => {
          for (const option of buttons.values()) option.disabled = false;
          give.disabled = picked === null;
        },
      };
    }
    const check = button(question.type === 'written' ? 'Submit' : 'Check answer', () => {
      const answer = read();
      if (answer === null) return;
      lockAll();
      send(answer);
    });
    let read: () => Answer | null = () => null;
    // put in order draws its arrows from whether it is locked, so it is drawn again on either
    let repaint: (() => void) | null = null;
    if (question.type === 'all') {
      const shown = copy!.shuffle_options ? shuffled(question.options.map((_, index) => index)) : question.options.map((_, index) => index);
      const boxes = new Map<number, HTMLInputElement>();
      for (const index of shown) {
        const box = el('input', { type: 'checkbox' });
        boxes.set(index, box);
        controls.push(box);
        form.append(el('label', { class: 'option' }, box, question.options[index] ?? ''));
      }
      read = () =>
        [...boxes]
          .filter(([, box]) => box.checked)
          .map(([index]) => index)
          .sort((a, b) => a - b);
    } else if (question.type === 'short' || question.type === 'written') {
      const id = `qg-${question.id}`;
      const field = question.type === 'short' ? el('input', { class: 'text', id, type: 'text', autocomplete: 'off', maxlength: '2000' }) : el('textarea', { id, maxlength: '10000' });
      controls.push(field);
      form.append(el('label', { class: 'field', for: id }, question.type === 'short' ? 'Your answer' : 'Your answer, in your own words'), field, el('div', { class: 'gap' }));
      if (field instanceof HTMLInputElement) field.addEventListener('keydown', (event) => event.key === 'Enter' && !check.disabled && check.click());
      read = () => (field.value.trim() === '' ? null : field.value.trim());
    } else if (question.type === 'order') {
      const items = [...question.items];
      const list = el('ol', { style: 'list-style:none;margin:0;padding:0', 'aria-label': 'Items, in the order you put them' });
      // the item being dragged, drawn lifted
      let held: string | null = null;
      const paint = (): void => {
        list.replaceChildren(
          ...items.map((item, index) => {
            const up = button('↑', () => move(index, -1), 'small');
            const down = button('↓', () => move(index, 1), 'small');
            up.setAttribute('aria-label', `Move ${item} up`);
            down.setAttribute('aria-label', `Move ${item} down`);
            up.disabled = index === 0 || check.disabled;
            down.disabled = index === items.length - 1 || check.disabled;
            if (check.disabled) return el('li', { class: 'row' }, el('span', {}, `${index + 1} · ${item}`), up, down);
            const row = el(
              'li',
              { class: `row sortable${held === item ? ' held' : ''}` },
              el('b', { class: 'grip', 'data-grip': '', 'aria-hidden': 'true' }, '⠿'),
              el('span', {}, `${index + 1} · ${item}`),
              up,
              down,
            );
            row.addEventListener('pointerdown', (event) => {
              const dragging = dragRow(event, list, index, place, () => {
                held = null;
                paint();
              });
              if (!dragging) return;
              held = item;
              paint();
            });
            return row;
          }),
        );
      };
      const place = (from: number, to: number): void => {
        const [taken] = items.splice(from, 1);
        items.splice(to, 0, taken!);
        paint();
      };
      const move = (index: number, by: number): void => {
        const [taken] = items.splice(index, 1);
        items.splice(index + by, 0, taken!);
        paint();
        list.querySelectorAll<HTMLButtonElement>('button')[index * 2 + by * 2 + (by > 0 ? 1 : 0)]?.focus();
      };
      paint();
      form.append(list, el('p', { class: 'faint' }, 'Drag each one into place, or move it with the arrows.'), el('div', { class: 'gap' }));
      read = () => [...items];
      repaint = paint;
    } else if (question.type === 'match') {
      const selects: HTMLSelectElement[] = [];
      question.lefts.forEach((left, index) => {
        const id = `qg-${question.id}-${index}`;
        const select = el('select', { id }, el('option', { value: '' }, 'Choose…'), ...question.rights.map((right) => el('option', { value: right }, right)));
        selects.push(select);
        controls.push(select);
        form.append(el('div', { class: 'pair' }, el('label', { for: id }, el('span', {}, left)), select));
      });
      read = () => (selects.some((select) => select.value === '') ? null : selects.map((select) => select.value));
    }
    controls.push(check);
    form.append(check);
    return {
      lock: () => {
        lockAll();
        repaint?.();
      },
      unlock: () => {
        unlockAll();
        repaint?.();
      },
    };
  }

  async function submitAnswer(
    question: GuestQuestion,
    answer: Answer,
    answering: { lock: (shown: Shown | null, right: boolean | null, answer: Answer) => void; unlock: () => void },
    feedback: HTMLElement,
    after: HTMLElement,
  ): Promise<void> {
    feedback.replaceChildren(el('p', { class: 'faint' }, 'Checking…'));
    const result = await eidos.check(question.id, answer);
    if (!result.ok) {
      answering.unlock();
      feedback.replaceChildren(el('div', { class: 'feedback problem', role: 'alert' }, problemOf(result)));
      return;
    }
    const shown = isShown(result.shown) ? result.shown : null;
    const right = result.right === true ? true : result.right === false ? false : null;
    answering.lock(shown, right, answer);
    checked.push({ question, answer, right, shown });
    feedback.replaceChildren(feedbackOf(question, right, shown));
    const last = at === order.length - 1;
    const next = button(last ? 'See your result' : 'Next question', () => {
      if (last) void finish();
      else {
        at += 1;
        ask();
      }
    });
    after.replaceChildren(next);
    next.focus();
  }

  function feedbackOf(question: GuestQuestion, right: boolean | null, shown: Shown | null): HTMLElement {
    const box = el('div', { class: `feedback ${right === true ? '' : right === false ? 'wrong' : 'wait'}` });
    if (question.type === 'written') {
      box.append(el('b', {}, 'Sent to the team to grade. '));
      if (shown?.model) box.append(el('span', {}, `A model answer: ${shown.model}`));
      if (shown?.covers) box.append(el('span', { class: 'reference' }, `A full answer covers: ${shown.covers}`));
    } else {
      box.append(el('b', {}, right ? 'Correct. ' : 'Not quite. '));
      if (!right && shown?.right) box.append(el('span', {}, `The answer: ${shown.right}. `));
      if (shown?.why) box.append(el('span', {}, shown.why));
    }
    const reference = shown?.reference;
    if (reference && 'text' in reference) box.append(el('span', { class: 'reference' }, reference.text));
    if (reference && 'url' in reference && /^https?:\/\//i.test(reference.url))
      box.append(el('a', { class: 'reference', href: reference.url, target: '_blank', rel: 'noopener noreferrer' }, `${reference.url} ↗`));
    return box;
  }

  async function finish(): Promise<void> {
    stage = 'result';
    const sending = el('p', { class: 'muted', role: 'status' }, 'Sending your answers…');
    show(el('h1', { tabindex: '-1', 'data-focus': '' }, copy!.title), sending);
    const answers: Record<string, Answer> = {};
    for (const held of checked) answers[held.question.id] = held.answer;
    const result = await eidos.submit({ quiz: copy!.quiz, name, answers });
    if (!result.ok) {
      show(
        el('h1', { tabindex: '-1', 'data-focus': '' }, 'Not sent yet'),
        el('div', { class: 'feedback problem', role: 'alert' }, `${problemOf(result)} Your answers are still here.`),
        button('Send again', () => void finish()),
      );
      return;
    }
    const score = result.score;
    const points = score?.points ?? checked.reduce((total, held) => total + (held.right ? held.question.points : 0), 0);
    const of = order.reduce((total, question) => total + question.points, 0);
    const waiting = checked.filter((held) => held.right === null).length;
    show(
      waiting > 0 ? el('p', { class: 'center' }, el('span', { class: 'pill' }, `${waiting} ${waiting === 1 ? 'answer' : 'answers'} waiting for a grade`)) : null,
      el('p', { class: 'score', tabindex: '-1', 'data-focus': '', 'aria-label': `${points} of ${of} points` }, el('b', {}, String(points)), el('span', {}, `of ${of}`)),
      el('p', { class: 'center' }, waiting > 0 ? `Points so far${name ? `, ${name}` : ''}` : `${of > 0 ? Math.round((points / of) * 100) : 0}%${name ? `, ${name}` : ''}`),
      waiting > 0 ? el('p', { class: 'center faint' }, 'The team grades your written answers.') : null,
      el(
        'ol',
        { class: 'review' },
        ...checked.map((held) => {
          const mark =
            held.right === true
              ? el('span', { class: 'mark ok', 'aria-label': 'Right' }, '✓')
              : held.right === false
                ? el('span', { class: 'mark no', 'aria-label': 'Wrong' }, '✗')
                : el('span', { class: 'mark waits', 'aria-label': 'Waiting for a grade' }, '…');
          const earned = held.right === null ? `Waiting for a grade · of ${held.question.points}` : `${held.right ? held.question.points : 0} of ${held.question.points}`;
          const answerLine = held.right === false && held.shown?.right ? `Answer: ${held.shown.right} · ${earned}` : earned;
          return el('li', {}, mark, el('b', {}, held.question.prompt), el('div', { class: 'detail' }, answerLine));
        }),
      ),
      button('Take it again', () => start(), 'quiet'),
    );
  }

  start();
};

export default draw;
