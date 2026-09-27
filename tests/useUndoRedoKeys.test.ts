import { expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { useUndoRedoKeys } from "@/composables/useUndoRedoKeys";

function makeHarness(undo: () => void, redo: () => void, enabled: () => boolean) {
  return defineComponent({
    setup() {
      useUndoRedoKeys(undo, redo, enabled);
      return () => h("div");
    },
  });
}

function press(key: string, init: KeyboardEventInit, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
}

test("ctrl+z calls undo", () => {
  let undoCount = 0;
  let redoCount = 0;
  const wrapper = mount(makeHarness(() => undoCount++, () => redoCount++, () => true));
  press("z", { ctrlKey: true });
  expect(undoCount).toBe(1);
  expect(redoCount).toBe(0);
  wrapper.unmount();
});

test("ctrl+y and ctrl+shift+z call redo", () => {
  let undoCount = 0;
  let redoCount = 0;
  const wrapper = mount(makeHarness(() => undoCount++, () => redoCount++, () => true));
  press("y", { ctrlKey: true });
  press("z", { ctrlKey: true, shiftKey: true });
  expect(redoCount).toBe(2);
  expect(undoCount).toBe(0);
  wrapper.unmount();
});

test("meta+z calls undo like ctrl+z", () => {
  let undoCount = 0;
  const wrapper = mount(makeHarness(() => undoCount++, () => {}, () => true));
  press("z", { metaKey: true });
  expect(undoCount).toBe(1);
  wrapper.unmount();
});

test("keys without ctrl or meta do nothing", () => {
  let undoCount = 0;
  let redoCount = 0;
  const wrapper = mount(makeHarness(() => undoCount++, () => redoCount++, () => true));
  press("z", {});
  press("y", {});
  press("a", { ctrlKey: true });
  expect(undoCount).toBe(0);
  expect(redoCount).toBe(0);
  wrapper.unmount();
});

test("a keydown on an interactive target is ignored", () => {
  let undoCount = 0;
  let redoCount = 0;
  const wrapper = mount(makeHarness(() => undoCount++, () => redoCount++, () => true));
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  press("z", { ctrlKey: true }, input);
  press("y", { ctrlKey: true }, input);
  expect(undoCount).toBe(0);
  expect(redoCount).toBe(0);
  input.remove();
  wrapper.unmount();
});

test("a disabled composable does nothing", () => {
  let undoCount = 0;
  let redoCount = 0;
  const wrapper = mount(makeHarness(() => undoCount++, () => redoCount++, () => false));
  press("z", { ctrlKey: true });
  press("y", { ctrlKey: true });
  expect(undoCount).toBe(0);
  expect(redoCount).toBe(0);
  wrapper.unmount();
});

test("unmount removes the window listener", () => {
  let undoCount = 0;
  const wrapper = mount(makeHarness(() => undoCount++, () => {}, () => true));
  wrapper.unmount();
  press("z", { ctrlKey: true });
  expect(undoCount).toBe(0);
});
