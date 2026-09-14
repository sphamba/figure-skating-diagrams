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
  hiddenSets: [] as unknown[],
  sequences: [] as unknown[],
}));

class EditorStub {
  hiddenSequences: Set<unknown> = new Set();

  constructor(_canvas: unknown, sequences: unknown[]) {
    recorder.constructorArgs.push({ sequences });
  }

  hiddenSequencesSize() {
    return this.hiddenSequences.size;
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
  destroy() {}
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

async function mountEditorView() {
  vi.stubGlobal("fetch", vi.fn());
  const { default: view } = await import("@/views/EditorView.vue");
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
        [OpenVue, { theme: { preset: appPreset, options: { prefix: "p", darkModeSelector: "system", cssLayer: false } } }],
        [ConfirmationService],
      ],
      stubs: { SelectButton: true, ColorPicker: true },
    },
  });
  await nextTick();
  return wrapper;
}

beforeEach(() => {
  localStorage.clear();
  recorder.constructorArgs.length = 0;
  recorder.hiddenSets.length = 0;
  recorder.sequences = [];
});

const timedDiagramJSON = {
  name: "Timed",
  bpm: 110,
  videoUrl: "https://example.com/video.mp4",
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
            coordinate: 1.5,
            data: { type: "time", value: 3.75 },
            transitionIn: "linear",
            transitionOut: "linear",
          },
        ],
      },
    },
    {
      name: "Later",
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
            data: { type: "beats", value: 0.5 },
            transitionIn: "linear",
            transitionOut: "linear",
          },
        ],
      },
    },
  ],
};

test("loading the video snaps the timestamp to the earliest time keyframe", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.loadFromJSON(timedDiagramJSON as never);
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

test("downloading the diagram clears the unsaved mark", async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.loadFromJSON(timedDiagramJSON as never);
  store.setDiagramName("Renamed");
  await nextTick();
  expect(store.isUnsaved()).toBe(true);

  const download = wrapper.findAll("button").find((button) => button.text().includes("Download JSON"));
  expect(download, "the download button should mount").not.toBeUndefined();
  await download!.trigger("click");
  await nextTick();

  expect(click).toHaveBeenCalled();
  expect(store.isUnsaved()).toBe(false);
  const tag = wrapper.find(".editor-view__unsaved-tag");
  expect(tag.text()).toBe("Saved");
  click.mockRestore();
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a store restored with zero sequences still constructs the editor", async () => {
  localStorage.setItem("sequence-editor", JSON.stringify({ name: "Diagram", sequences: [] }));
  const wrapper = await mountEditorView();

  expect(recorder.constructorArgs).toHaveLength(1);
  const emptyEditorArg = recorder.constructorArgs[0] as { sequences: unknown[] };
  expect(emptyEditorArg.sequences).toHaveLength(0);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("loading a diagram after a zero-sequence store reaches the editor", async () => {
  localStorage.setItem("sequence-editor", JSON.stringify({ name: "Diagram", sequences: [] }));
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await nextTick();
  await nextTick();

  const editorArg = recorder.constructorArgs[0] as { sequences: unknown[] };
  expect(editorArg.sequences).toHaveLength(0);

  store.loadFromJSON(timedDiagramJSON as never);
  await nextTick();
  await nextTick();

  const latestList = recorder.sequences as unknown[];
  expect(latestList).toHaveLength(2);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("EditorView passes the full list and the hidden set tracks visibility toggles", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await nextTick();
  await nextTick();

  const editorArg = recorder.constructorArgs[recorder.constructorArgs.length - 1] as { sequences: unknown[] };
  expect(editorArg.sequences).toHaveLength(1);

  store.addSequence();
  await nextTick();
  await nextTick();
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
  const hidden = [...lastHidden][0] as Sequence;
  expect(store.getSequences().includes(hidden)).toBe(true);
  expect(store.isVisible(store.getSequences()[0] as Sequence)).toBe(false);
  expect(store.isVisible(store.getSequences()[1] as Sequence)).toBe(true);
  wrapper.unmount();
  vi.unstubAllGlobals();
});
