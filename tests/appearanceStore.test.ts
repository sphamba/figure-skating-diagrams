import { beforeEach, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { MockInstance } from "vitest";

type ChangeListener = (event: { matches: boolean }) => void;

const listeners: ChangeListener[] = [];
let systemDark = false;

const mediaQuery = {
  get matches() {
    return systemDark;
  },
  addEventListener: (_type: string, listener: ChangeListener) => listeners.push(listener),
  removeEventListener: () => {},
};

const matchMedia = vi.fn().mockImplementation(() => mediaQuery);

function fireSystemChange(matches: boolean) {
  systemDark = matches;
  for (const listener of listeners) listener({ matches });
}

beforeEach(() => {
  listeners.length = 0;
  systemDark = false;
  vi.stubGlobal("matchMedia", matchMedia as unknown as MockInstance);
  vi.resetModules();
  localStorage.clear();
  setActivePinia(createPinia());
  document.documentElement.className = "";
});

test("the store defaults to the browser color scheme and toggles the class", async () => {
  systemDark = true;
  const { useAppearanceStore } = await import("@/stores/appearance");
  const store = useAppearanceStore();

  expect(store.darkMode).toBe(true);
  expect(document.documentElement.classList.contains("app-dark")).toBe(true);

  store.darkMode = false;
  expect(document.documentElement.classList.contains("app-dark")).toBe(false);

  store.darkMode = true;
  expect(document.documentElement.classList.contains("app-dark")).toBe(true);
  vi.unstubAllGlobals();
});

test("the store follows the system until the user overrides", async () => {
  const { useAppearanceStore } = await import("@/stores/appearance");
  const store = useAppearanceStore();
  expect(store.darkMode).toBe(false);

  fireSystemChange(true);
  expect(store.darkMode).toBe(true);

  store.darkMode = false;
  fireSystemChange(true);
  expect(store.darkMode).toBe(false);

  store.darkMode = true;
  fireSystemChange(false);
  expect(store.darkMode).toBe(true);
  vi.unstubAllGlobals();
});

test("the store falls back to light without matchMedia", async () => {
  vi.unstubAllGlobals();
  const { useAppearanceStore } = await import("@/stores/appearance");
  const store = useAppearanceStore();

  expect(store.darkMode).toBe(false);
  expect(document.documentElement.classList.contains("app-dark")).toBe(false);
});

test("the store restores the persisted settings after a reload", async () => {
  const { useAppearanceStore } = await import("@/stores/appearance");
  const store = useAppearanceStore();
  expect(store.showLegend).toBe(true);
  store.darkMode = true;
  store.showLabels = false;
  store.showLegend = false;
  store.scaleElements = false;
  expect(store.darkMode).toBe(true);
  expect(document.documentElement.classList.contains("app-dark")).toBe(true);

  vi.resetModules();
  setActivePinia(createPinia());
  const { useAppearanceStore: reloaded } = await import("@/stores/appearance");
  const next = reloaded();
  expect(next.darkMode).toBe(true);
  expect(next.showLabels).toBe(false);
  expect(next.showLegend).toBe(false);
  expect(next.scaleElements).toBe(false);
  expect(document.documentElement.classList.contains("app-dark")).toBe(true);
  vi.unstubAllGlobals();
});
