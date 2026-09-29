import { beforeEach, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref, nextTick } from "vue";
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

beforeEach(() => {
  listeners.length = 0;
  systemDark = false;
  vi.stubGlobal("matchMedia", matchMedia as unknown as MockInstance);
  vi.resetModules();
  localStorage.clear();
  setActivePinia(createPinia());
  document.documentElement.className = "";
});

test("the sequence editor store restores a persisted short draw range", async () => {
  localStorage.setItem("sequence-editor-short-draw-range", "true");
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();

  expect(store.getShortDrawRange()).toBe(true);

  store.setShortDrawRange(false);
  expect(localStorage.getItem("sequence-editor-short-draw-range")).toBe("false");
});

test("the playback speed composable restores and persists the speed", async () => {
  localStorage.setItem("playback-speed", "0.5");
  const { usePlaybackSpeed } = await import("@/composables/usePlaybackSpeed");
  const { speed } = usePlaybackSpeed(ref<HTMLVideoElement | null>(null));
  expect(speed.value).toBe(0.5);

  speed.value = 1;
  await nextTick();
  expect(localStorage.getItem("playback-speed")).toBe("1");
  vi.unstubAllGlobals();
});

test("the playback speed composable falls back to 1 for an invalid stored speed", async () => {
  localStorage.setItem("playback-speed", "2");
  const { usePlaybackSpeed } = await import("@/composables/usePlaybackSpeed");
  const { speed } = usePlaybackSpeed(ref<HTMLVideoElement | null>(null));
  expect(speed.value).toBe(1);
  vi.unstubAllGlobals();
});

test("the appearance store ignores an unparsable stored value", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  localStorage.setItem("appearance", "not json");
  const { useAppearanceStore } = await import("@/stores/appearance");
  const store = useAppearanceStore();

  expect(store.darkMode).toBe(false);
  expect(store.showLabels).toBe(true);
  expect(store.scaleElements).toBe(true);
  expect(document.documentElement.classList.contains("app-dark")).toBe(false);
  vi.unstubAllGlobals();
});
