// Dragging one row of a list into a new place, for putting items in order, shared by the page and a public link's guest
// page. A mouse drags from anywhere on the row; a finger or a pen from its grip (marked `data-grip`), so the rest of the row
// still scrolls the page on a phone. The row moves live: as the pointer passes the middle of the row beside it, `onMove`
// puts it there, and the next move goes on from where it now is. The list's children are its rows and nothing else.
export function dragRow(event: PointerEvent, list: HTMLElement, index: number, onMove: (from: number, to: number) => void, onEnd: () => void): boolean {
  const target = event.target as Element;
  if (event.button !== 0 || target.closest('button, a, input, select, textarea')) return false;
  if (event.pointerType !== 'mouse' && !target.closest('[data-grip]')) return false;
  // no text is selected and no compatibility mouse events follow
  event.preventDefault();
  let at = index;
  const middle = (row: Element): number => {
    const box = row.getBoundingClientRect();
    return box.top + box.height / 2;
  };
  const follow = (moved: PointerEvent): void => {
    if (moved.pointerId !== event.pointerId) return;
    const rows = [...list.children];
    let to = at;
    while (to > 0 && moved.clientY < middle(rows[to - 1]!)) to -= 1;
    while (to < rows.length - 1 && moved.clientY > middle(rows[to + 1]!)) to += 1;
    if (to === at) return;
    onMove(at, to);
    at = to;
  };
  const stop = (ended: PointerEvent): void => {
    if (ended.pointerId !== event.pointerId) return;
    window.removeEventListener('pointermove', follow);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    onEnd();
  };
  window.addEventListener('pointermove', follow);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
  return true;
}
