import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { Component } from "vue";
import type { Sequence } from "@/engine/sequence";

vi.mock("virtual:diagram-tree", () => ({
  default: { name: "diagrams", files: [], folders: [] },
}));

vi.spyOn(console, "error").mockImplementation(() => {});

const recorder = vi.hoisted(() => ({
  constructorArgs: [] as { sequences: unknown[] }[],
  hiddenSets: [] as unknown,
  sequences: [] as unknown[],
  destroyed: 0,
}));

class EditorStub {
  hiddenSequences: Set<unknown> = new Set();

  constructor(_canvas: unknown, sequences: unknown[]) {
    recorder.constructorArgs.push({ sequences });
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
  expect(document.querySelector(".home-view__sidebar")?.textContent)?.toContain("https://example.com/video.mp4");
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a failed tree load clears the select and shows an error", async () => {
  const wrapper = await mountHomeView("diagrams/bad-file.json", false, videoFile);
  await wrapper.find('[data-test="tree-open"]').trigger("click");
  await nextTick();
  await nextTick();
  await nextTick();
  const small = document.querySelector(".home-view__load-error");
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

test("the view passes the full list and the hidden set tracks visibility toggles", async () => {
  const wrapper = await mountHomeView(null, true, videoFile);
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await nextTick();
  await nextTick();

  store.addSequence();
  await nextTick();
  await nextTick();

  const editorArg = recorder.constructorArgs[recorder.constructorArgs.length - 1] as { sequences: unknown[] };
  expect(editorArg.sequences).toHaveLength(1);
  const latestList = recorder.sequences as unknown[];
  expect(latestList).toHaveLength(2);

  const switches = wrapper.findAll(".p-toggleswitch");
  expect(switches.length).toBe(2);
  const switchInput = switches[0]!.find(".p-toggleswitch-input");
  (switchInput.element as HTMLInputElement).checked = false;
  await switchInput.trigger("change");
  await nextTick();
  await nextTick();
  await nextTick();

  const lastHidden = recorder.hiddenSets[recorder.hiddenSets.length - 1] as Set<unknown>;
  expect(lastHidden).toHaveLength(1);
  const hidden = [...lastHidden][0] as { name: string };
  expect(store.getSequences().some((sequence: Sequence) => sequence === (hidden as Sequence))).toBe(true);
  expect(store.isVisible(store.getSequences()[0] as Sequence)).toBe(false);
  expect(store.isVisible(store.getSequences()[1] as Sequence)).toBe(true);
  wrapper.unmount();
  vi.unstubAllGlobals();
});
