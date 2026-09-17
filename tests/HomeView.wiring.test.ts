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
  instances: [] as unknown[],
}));

class EditorStub {
  hiddenSequences: Set<unknown> = new Set();
  tracking = false;
  onTrackingChange?: () => void;

  constructor(_canvas: unknown, sequences: unknown[]) {
    recorder.constructorArgs.push({ sequences });
    recorder.instances.push(this);
  }

  trackingStage: "off" | "barycenter" | "cursor" = "off";

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
      button.getAttribute("aria-label")?.includes("animation"),
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

test("the tracking button advances the tracking cycle through clicks", async () => {
  const wrapper = await mountHomeView(null, true, videoFile);
  const button = wrapper.find(".tracking-button");
  expect(button.exists()).toBe(true);
  const instance = recorder.instances.at(-1) as { tracking: boolean } | undefined;
  expect(instance, "the editor should mount with the canvas").not.toBeUndefined();
  expect(instance!.tracking).toBe(false);
  await button.trigger("click");
  expect(instance!.tracking).toBe(true);
  expect(button.attributes("aria-pressed")).toBe("true");
  // Further clicks advance the cycle instead of breaking the tracking, so
  // the button stays pressed and only pan/pinch can break it.
  await button.trigger("click");
  expect(instance!.tracking).toBe(true);
  expect(button.attributes("aria-pressed")).toBe("true");
  instance!.tracking = false;
  instance!.onTrackingChange?.();
  await nextTick();
  expect(button.attributes("aria-pressed")).toBe("false");
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the tracking button resets after the canvas remounts", async () => {
  const wrapper = await mountHomeView(null, true, videoFile);
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.loadFromJSON(videoFile);
  await nextTick();
  const button = wrapper.find(".tracking-button");
  const instance = recorder.instances.at(-1) as { tracking: boolean } | undefined;
  await button.trigger("click");
  expect(button.attributes("aria-pressed")).toBe("true");
  // Unsetting the video re-keys the splitter, so the canvas remounts.
  store.setDiagramVideoUrl("");
  await nextTick();
  expect(recorder.destroyed).toBeGreaterThan(0);
  const next = recorder.instances.at(-1) as { tracking: boolean } | undefined;
  expect(next).not.toBe(instance);
  expect(next!.tracking).toBe(false);
  expect(wrapper.find(".tracking-button").attributes("aria-pressed")).toBe("false");
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the tracking button shows the cursor icon while following a cursor", async () => {
  const wrapper = await mountHomeView(null, true, videoFile);
  const button = wrapper.find(".tracking-button");
  const instance = recorder.instances.at(-1) as {
    tracking: boolean;
    trackingStage: "barycenter" | "cursor";
    onTrackingChange?: () => void;
  } | undefined;
  expect(instance, "the editor should mount with the canvas").not.toBeUndefined();
  expect(button.find("polygon").exists()).toBe(false);
  await button.trigger("click");
  expect(button.find(".tracking-button__icon circle").exists()).toBe(true);
  expect(button.find("polygon").exists()).toBe(false);
  instance!.trackingStage = "cursor";
  instance!.onTrackingChange?.();
  await nextTick();
  expect(button.find("polygon").exists()).toBe(true);
  expect(button.find(".tracking-button__icon circle").exists()).toBe(false);
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
