import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { Component } from "vue";

vi.mock("virtual:diagram-tree", () => ({
  default: { name: "diagrams", files: [], folders: [] },
}));

vi.spyOn(console, "error").mockImplementation(() => {});

const recorder = vi.hoisted(() => ({
  constructorArgs: [] as { sequences: unknown[] }[],
  hiddenSets: [] as unknown[],
  sequences: [] as unknown[],
  destroyed: 0,
  instances: [] as unknown[],
}));

class EditorStub {
  hiddenSequences: Set<unknown> = new Set();
  tracking = false;
  onTrackingChange?: () => void;

  constructor(_canvas: unknown, sequences: unknown[], _options?: { occludedTop?: () => number }) {
    recorder.constructorArgs.push({ sequences });
    recorder.instances.push(this);
  }

  trackingStage: "off" | "barycenter" | "cursor" = "off";

  refit() {}

  followTimeCursor() {
    this.trackingStage = this.trackingStage === "barycenter" ? "cursor" : "barycenter";
    this.tracking = true;
    this.onTrackingChange?.();
  }

  disableTracking() {
    this.tracking = false;
    this.onTrackingChange?.();
  }

  setHiddenSequences(next: unknown) {
    this.hiddenSequences = next;
    recorder.hiddenSets.push(next);
  }

  clearSelection() {}
  requestDraw() {}
  setSequences(list: unknown[]) {
    recorder.sequences = list;
  }
  destroy() {
    recorder.destroyed++;
  }
}

vi.mock("@/engine/sequenceEditor/editor", async (importOriginal) => ({
  ...(await importOriginal<{ [key: symbol]: unknown }>()),
  Editor: EditorStub,
}));

// Stub matchMedia: jsdom does not implement it.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// The mobile drawer tabs bind one, so the drawer test needs the stub.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

function emitSelectStub(path: string) {
  return {
    template: `<div><button data-test="tree-open" @click="$emit('select', { source: 'bundled', path: '${path}' })">o</button></div>`,
  };
}

async function mountHomeView(selectPath: string | null, fetchOk: boolean, fetchResult: unknown) {
  if (!fetchOk) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
  } else {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(fetchResult), { status: 200 })),
    );
  }
  const { default: view } = await import("@/views/HomeView.vue");
  const { default: OpenVue } = await import("openvue/config");
  const { default: ConfirmationService } = await import("openvue/confirmationservice");
  const { default: Aura } = await import("@openvue/themes/aura");
  const { definePreset } = await import("@openuxkit/themes");
  const appPreset = definePreset(Aura, { semantic: { primary: { 50: "{sky.50}" } } });
  setActivePinia(createPinia());
  const wrapper = mount(view as Component, {
    attachTo: document.body,
    global: {
      plugins: [
        [
          OpenVue,
          { theme: { preset: appPreset, options: { prefix: "p", darkModeSelector: "system", cssLayer: false } } },
        ],
        [ConfirmationService],
      ],
      stubs: selectPath ? { DiagramTree: emitSelectStub(selectPath) } : {},
    },
  });
  await nextTick();
  return wrapper;
}

const videoFile = {
  name: "Video Diagram",
  bpm: 110,
  videoUrl: "https://example.com/video.mp4",
  sequences: [],
};

beforeEach(() => {
  localStorage.clear();
  recorder.constructorArgs.length = 0;
  recorder.hiddenSets.length = 0;
  recorder.sequences = [];
  recorder.destroyed = 0;
  recorder.instances.length = 0;
});

const timedReaderSequenceJSON = {
  name: "Timed",
  bpm: 110,
  videoUrl: "",
  sequences: [
    {
      name: "Timed",
      path: { curves: [{ p0: [0, -1.2], p1: [0, -1.2], p2: [0, 1.2], p3: [0, 1.2] }] },
      elements: [],
      keyframes: {
        footL: [],
        footR: [],
        hips: [],
        time: [
          {
            kind: "TimingKeyframe",
            coordinate: 1,
            data: { type: "time", value: 5 },
            transitionIn: "linear",
            transitionOut: "linear",
          },
          {
            kind: "TimingKeyframe",
            coordinate: 2,
            data: { type: "time", value: 8 },
            transitionIn: "linear",
            transitionOut: "linear",
          },
        ],
      },
    },
  ],
};

test("the space key toggles the playback and skips text targets", async () => {
  const wrapper = await mountHomeView(null, true, videoFile);
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.loadFromJSON(timedReaderSequenceJSON as never);
  await nextTick();
  await nextTick();

  const findPlayButton = () =>
    Array.from(document.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label") === "Play the animation",
    );
  const play = findPlayButton();
  expect(play, "the play button should mount").not.toBeUndefined();
  expect(play!.getAttribute("aria-label")).toBe("Play the animation");

  const input = document.createElement("input");
  document.body.appendChild(input);
  input.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }));
  await nextTick();
  expect(play!.getAttribute("aria-label"), "space in a text field must not toggle the playback").toBe(
    "Play the animation",
  );
  input.remove();

  await wrapper.find(".home-view__player").trigger("keydown", { code: "Space" });
  await nextTick();
  expect(play!.getAttribute("aria-label"), "space elsewhere should start the playback").toBe("Pause the animation");

  await wrapper.find(".home-view__player").trigger("keydown", { code: "Space" });
  await nextTick();
  expect(play!.getAttribute("aria-label"), "a second space press should pause the playback").toBe("Play the animation");

  const backward = Array.from(document.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes("earliest"),
  );
  expect(backward, "the jump-to-start button should mount").not.toBeUndefined();
  backward!.focus();
  backward!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  await nextTick();
  expect(document.activeElement, "a mouse click should blur the button").not.toBe(backward);

  document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }));
  await nextTick();
  expect(play!.getAttribute("aria-label"), "space should still toggle after a button mouse click").toBe(
    "Pause the animation",
  );
  wrapper.unmount();
  vi.unstubAllGlobals();
});

const videoTimeOfEditor = () =>
  (recorder.instances.at(-1) as { videoTimeSeconds?: number } | undefined)?.videoTimeSeconds ?? -1;

const mountWithVideo = async () => {
  const wrapper = await mountHomeView(null, true, videoFile);
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  useSequenceEditorStore().loadFromJSON(videoFile);
  await nextTick();
  await nextTick();
  return wrapper;
};

test("the right arrow steps the time cursor forward on the home page", async () => {
  const wrapper = await mountWithVideo();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  await nextTick();
  await nextTick();

  expect(videoTimeOfEditor()).toBeCloseTo(1 / 30);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the left arrow stays at zero on the home page", async () => {
  const wrapper = await mountWithVideo();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
  await nextTick();
  await nextTick();

  expect(videoTimeOfEditor(), "the lower clamp keeps the cursor at zero").toBe(0);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the arrows ignore a focused input on the home page", async () => {
  const wrapper = await mountWithVideo();
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();

  input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await nextTick();
  await nextTick();

  expect(videoTimeOfEditor(), "a text field keeps its own arrow behavior").toBe(0);
  input.remove();
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the arrows stay off while the mobile drawer is open on the home page", async () => {
  // The file level matchMedia stub is writable but not configurable, so the swaps use plain assignment.
  const previous = window.matchMedia;
  try {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 767.98px)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const wrapper = await mountWithVideo();

    const menu = Array.from(document.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Open settings",
    );
    expect(menu, "the mobile hamburger should mount").not.toBeUndefined();
    menu!.click();
    await nextTick();
    await nextTick();
    expect(document.querySelector(".p-drawer"), "the mobile settings drawer should open").not.toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    await nextTick();
    await nextTick();
    expect(videoTimeOfEditor(), "the arrows stay off while the drawer is open").toBe(0);

    const close = document.querySelector<HTMLButtonElement>(".p-drawer-close-button");
    expect(close, "the drawer close button should mount").not.toBeNull();
    close!.click();
    await nextTick();
    await nextTick();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    await nextTick();
    await nextTick();
    expect(videoTimeOfEditor(), "the arrows return once the drawer is closed").toBeCloseTo(1 / 30);

    wrapper.unmount();
  } finally {
    window.matchMedia = previous;
  }
  vi.unstubAllGlobals();
});
