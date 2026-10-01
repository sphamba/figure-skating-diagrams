import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

beforeEach(() => {
  // The store attaches document listeners at creation and never removes them.
  // Stale listeners write to their own stores, and the current store registers
  // last, so each dispatch chain ends with a write from the current store.
  vi.resetModules();
  localStorage.clear();
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("the input mode store defaults to mouseKeyboard with empty localStorage", async () => {
  const { useInputModeStore } = await import("@/stores/inputMode");
  const store = useInputModeStore();

  expect(store.mode).toBe("mouseKeyboard");
  expect(localStorage.getItem("input-mode")).toBeNull();
});

test("the input mode store restores a stored touch mode from localStorage", async () => {
  localStorage.setItem("input-mode", "touch");
  const { useInputModeStore } = await import("@/stores/inputMode");
  const store = useInputModeStore();

  expect(store.mode).toBe("touch");
});

test("the input mode store ignores an unparsable stored value and falls back to mouseKeyboard", async () => {
  localStorage.setItem("input-mode", "not a mode");
  const { useInputModeStore } = await import("@/stores/inputMode");
  const store = useInputModeStore();

  expect(store.mode).toBe("mouseKeyboard");
});

test("a touchstart on document switches the mode to touch and stores it", async () => {
  const { useInputModeStore } = await import("@/stores/inputMode");
  const store = useInputModeStore();

  document.dispatchEvent(new Event("touchstart"));

  expect(store.mode).toBe("touch");
  expect(localStorage.getItem("input-mode")).toBe("touch");
});

test("a mousedown on document switches the mode to mouseKeyboard and stores it", async () => {
  let now = 10_000;
  const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
  const { useInputModeStore } = await import("@/stores/inputMode");
  const store = useInputModeStore();

  // A touch first puts the store in touch mode, so the mousedown is a real
  // change. The mock jumps past the 1000 ms synthetic-mouse window.
  document.dispatchEvent(new Event("touchstart"));
  now += 1001;
  document.dispatchEvent(new MouseEvent("mousedown"));

  expect(store.mode).toBe("mouseKeyboard");
  expect(localStorage.getItem("input-mode")).toBe("mouseKeyboard");
  nowSpy.mockRestore();
});

test("a wheel on document switches the mode to mouseKeyboard and stores it", async () => {
  const { useInputModeStore } = await import("@/stores/inputMode");
  const store = useInputModeStore();

  // A touch first puts the store in touch mode, so the wheel is a real change.
  document.dispatchEvent(new Event("touchstart"));
  document.dispatchEvent(new WheelEvent("wheel"));

  expect(store.mode).toBe("mouseKeyboard");
  expect(localStorage.getItem("input-mode")).toBe("mouseKeyboard");
});

test("a keydown on document switches the mode to mouseKeyboard and stores it", async () => {
  const { useInputModeStore } = await import("@/stores/inputMode");
  const store = useInputModeStore();

  // A touch first puts the store in touch mode, so the keydown is a real change.
  document.dispatchEvent(new Event("touchstart"));
  document.dispatchEvent(new KeyboardEvent("keydown"));

  expect(store.mode).toBe("mouseKeyboard");
  expect(localStorage.getItem("input-mode")).toBe("mouseKeyboard");
});

test("a mousedown within 1000 ms after a touchstart does not switch the mode back", async () => {
  const { useInputModeStore } = await import("@/stores/inputMode");
  const store = useInputModeStore();

  document.dispatchEvent(new Event("touchstart"));
  document.dispatchEvent(new MouseEvent("mousedown"));

  // Stale listeners from earlier stores may write mouseKeyboard here, so only
  // the current store mode proves the guard.
  expect(store.mode).toBe("touch");
});
