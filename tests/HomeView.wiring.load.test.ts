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
  hiddenSets: [] as unknown,
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
  setBackgroundImage(dataUrl: string | undefined) {}
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

const timingSequenceJSON = {
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
        coordinate: 1.5,
        data: { type: "time", value: 3.75 },
        transitionIn: "linear",
        transitionOut: "linear",
      },
    ],
  },
};

const timedVideoFile = {
  name: "Timed Video Diagram",
  bpm: 110,
  videoUrl: "https://example.com/video.mp4",
  sequences: [timingSequenceJSON],
};

beforeEach(() => {
  localStorage.clear();
  recorder.constructorArgs.length = 0;
  recorder.hiddenSets.length = 0;
  recorder.sequences = [];
  recorder.destroyed = 0;
  recorder.instances.length = 0;
});

test("the tree loader mounts the player and fills the url", async () => {
  const wrapper = await mountHomeView("diagrams/test-video.json", true, videoFile);
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await wrapper.find('[data-test="tree-open"]').trigger("click");
  await nextTick();
  await nextTick();
  await nextTick();

  expect(store.getDiagram().videoUrl, "the store must keep the url").toBe("https://example.com/video.mp4");
  expect(store.getDiagram().bpm).toBe(110);
  const video = document.querySelector("video");
  expect(video, "the player should mount after load").not.toBeNull();
  expect(video?.getAttribute("src")).toBe("https://example.com/video.mp4");
  expect(document.querySelector(".diagram-sidebar")?.textContent)?.toContain("https://example.com/video.mp4");
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a failed tree load clears the select and shows an error", async () => {
  const wrapper = await mountHomeView("diagrams/bad-file.json", false, videoFile);
  await wrapper.find('[data-test="tree-open"]').trigger("click");
  await nextTick();
  await nextTick();
  await nextTick();
  const small = document.querySelector(".diagram-sidebar__load-error");
  expect(small !== null).toBe(true);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("loading the video snaps the timestamp to the earliest time keyframe", async () => {
  const wrapper = await mountHomeView("diagrams/test-video.json", true, timedVideoFile);
  await wrapper.find('[data-test="tree-open"]').trigger("click");
  await nextTick();
  await nextTick();
  await nextTick();
  const video = document.querySelector("video");
  expect(video, "the player should mount after load").not.toBeNull();
  video!.dispatchEvent(new Event("loadeddata"));
  await nextTick();
  expect(video!.currentTime).toBe(3.75);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("loading the video without time keyframes keeps the timestamp", async () => {
  const wrapper = await mountHomeView("diagrams/test-video.json", true, videoFile);
  await wrapper.find('[data-test="tree-open"]').trigger("click");
  await nextTick();
  await nextTick();
  await nextTick();
  const video = document.querySelector("video");
  expect(video, "the player should mount after load").not.toBeNull();
  video!.dispatchEvent(new Event("loadeddata"));
  await nextTick();
  expect(video!.currentTime).toBe(0);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a store restored with zero sequences still constructs the editor", async () => {
  localStorage.setItem("sequence-editor", JSON.stringify({ name: "Diagram", sequences: [] }));
  const wrapper = await mountHomeView(null, true, videoFile);
  await nextTick();

  expect(recorder.constructorArgs).toHaveLength(1);
  const emptyEditorArg = recorder.constructorArgs[0] as { sequences: unknown[] };
  expect(emptyEditorArg.sequences).toHaveLength(0);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("loading a diagram with a video re-creates the editor on the new canvas", async () => {
  const wrapper = await mountHomeView("diagrams/test-video.json", true, timedVideoFile);
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  useSequenceEditorStore();
  await nextTick();
  await nextTick();
  expect(recorder.constructorArgs).toHaveLength(1);

  await wrapper.find('[data-test="tree-open"]').trigger("click");
  await nextTick();
  await nextTick();
  await nextTick();

  expect(recorder.destroyed).toBeGreaterThanOrEqual(1);
  expect(recorder.constructorArgs).toHaveLength(2);
  const newEditorArg = recorder.constructorArgs[1] as { sequences: unknown[] };
  expect(newEditorArg.sequences).toHaveLength(1);
  expect(document.querySelector(".home-view__video")).not.toBeNull();
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a freshly loaded diagram snaps the timestamp to the earliest timestamp", async () => {
  const wrapper = await mountHomeView(null, true, videoFile);
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.loadFromJSON(videoFile);
  await nextTick();
  const video = wrapper.find("video");
  expect(video.exists()).toBe(true);
  await nextTick();
  // An out-of-range current time before the load proves the load snaps back.
  video.element.currentTime = 8;
  await nextTick();
  store.loadFromJSON(timedVideoFile);
  await nextTick();
  expect(video.element.currentTime).toBe(3.75);
  // Regular detail edits keep the same diagram object, so they do not snap.
  store.setDiagramVideoUrl("https://example.com/video.mp4");
  video.element.currentTime = 9;
  await nextTick();
  expect(video.element.currentTime).toBe(9);
  wrapper.unmount();
  vi.unstubAllGlobals();
});
