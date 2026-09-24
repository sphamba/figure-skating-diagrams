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

test("the short draw range toggle sits leftmost in the player controls", async () => {
  const wrapper = await mountHomeView(null, true, videoFile);
  const controls = wrapper.find(".home-view__player-controls");
  expect(controls.exists()).toBe(true);
  const buttons = controls.findAll("button");
  const toggle = buttons[0]!;
  expect(toggle.find(".pi-stopwatch").exists()).toBe(true);
  expect(toggle.attributes("aria-pressed")).toBe("false");
  // The go-back button keeps its place behind the toggle.
  expect(buttons[1]!.find(".pi-step-backward").exists()).toBe(true);
  const instance = recorder.instances.at(-1) as { shortDrawRange?: boolean } | undefined;
  expect(instance, "the editor should mount with the canvas").not.toBeUndefined();
  expect(instance!.shortDrawRange).toBe(false);
  await toggle.trigger("click");
  await nextTick();
  expect(toggle.attributes("aria-pressed")).toBe("true");
  expect(instance!.shortDrawRange).toBe(true);
  wrapper.unmount();
  vi.unstubAllGlobals();
});
