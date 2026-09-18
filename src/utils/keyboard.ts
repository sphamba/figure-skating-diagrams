// Text fields, lists and buttons keep their own keyboard behavior, so a global
// key handler ignores key events that start on them.
export function isInteractiveKeyTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) ||
      target.closest('[role="option"]') !== null)
  );
}
