import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { Component } from "vue";
import Tooltip from "openvue/tooltip";

vi.mock("virtual:diagram-tree", () => ({
  default: { name: "diagrams", files: [], folders: [] },
}));

vi.spyOn(console, "error").mockImplementation(() => {});

const recorder = vi.hoisted(() => ({
  constructorArgs: [] as { sequences: unknown[] }[],
  hiddenSets: [] as unknown[],
  sequences: [] as unknown[],
  isProvisional: false,
  editor: null as unknown as {
    onElementChangeRequest: (element: unknown) => void;
    onTimingKeyframeChangeRequest: (keyframe: unknown, isProvisional: boolean) => void;
  },
}));

class EditorStub {
  hiddenSequences: Set<unknown> = new Set();
  occludedTop: (() => number) | null = null;

  constructor(_canvas: unknown, sequences: unknown[], options?: { occludedTop?: () => number }) {
    this.occludedTop = options?.occludedTop ?? null;
    recorder.constructorArgs.push({ sequences });
    recorder.editor = this as unknown as {
      onElementChangeRequest: (element: unknown) => void;
      onTimingKeyframeChangeRequest: (keyframe: unknown, isProvisional: boolean) => void;
    };
  }

  hiddenSequencesSize() {
    return this.hiddenSequences.size;
  }

  setHiddenSequences(next: unknown) {
    this.hiddenSequences = next;
    recorder.hiddenSets.push(next);
  }

  isProvisional() {
    return recorder.isProvisional;
  }

  getSequenceOfElement() {
    return {};
  }

  invalidateTimeCachesFor(_keyframe: unknown) {}

  refit() {}
  clearSelection() {}
  requestDraw() {}
  draw() {}
  setSequences(list: unknown[]) {
    recorder.sequences = list;
  }
  destroy() {}
}

vi.mock("@/engine/sequenceEditor/editor", async (importOriginal) => ({
  ...(await importOriginal<{ [key: symbol]: unknown }>()),
  Editor: EditorStub,
}));

vi.mock("@/engine/sequenceEditor/variantValidation", () => ({
  checkTurnVariantValidity: () => ({ left: true, forward: true, inside: false }),
  checkOneFootVariantValidity: () => ({ forward: true, inside: false }),
}));

// Stub matchMedia and ResizeObserver: jsdom does not implement them.
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
        [
          OpenVue,
          { theme: { preset: appPreset, options: { prefix: "p", darkModeSelector: "system", cssLayer: false } } },
        ],
        [ConfirmationService],
      ],
      directives: { tooltip: Tooltip },
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
  recorder.isProvisional = false;
  recorder.editor = null;
});

// The tooltip shows over a macrotask, so the test waits one timer tick.
const flushTask = () => new Promise((resolve) => setTimeout(resolve));

const videoTimeSecondsOfEditor = () =>
  (recorder.editor as unknown as { videoTimeSeconds?: number }).videoTimeSeconds ?? -1;

test("the right arrow steps the time cursor forward by the default step", async () => {
  const wrapper = await mountEditorView();
  await nextTick();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  await nextTick();
  await nextTick();

  expect(videoTimeSecondsOfEditor()).toBeCloseTo(1 / 30);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the arrows step back and clamp the time cursor at zero", async () => {
  const wrapper = await mountEditorView();
  await nextTick();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  await nextTick();
  await nextTick();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  await nextTick();
  await nextTick();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
  await nextTick();
  await nextTick();
  expect(videoTimeSecondsOfEditor()).toBeCloseTo(1 / 30);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
  await nextTick();
  await nextTick();
  expect(videoTimeSecondsOfEditor()).toBeCloseTo(0);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the arrows do not step the time cursor inside an open dialog", async () => {
  const wrapper = await mountEditorView();
  await nextTick();
  recorder.editor.onElementChangeRequest({
    type: "LeftForwardInsideThreeTurn",
    shortName: "LFI-3T",
    start: 0,
    end: 1,
  });
  await nextTick();
  await nextTick();
  expect(document.getElementById("element-short-name"), "the element dialog should be open").not.toBeNull();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  await nextTick();
  await nextTick();

  expect(videoTimeSecondsOfEditor()).toBe(0);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("hovering a mode tab shows its key letter in a tooltip", async () => {
  const wrapper = await mountEditorView();
  await nextTick();
  const tab = document.querySelector('.editor-view__mode-tabs [role="tab"]');
  expect(tab, "the first mode tab should mount").not.toBeNull();

  tab!.dispatchEvent(new MouseEvent("mouseenter"));
  await flushTask();
  expect(document.querySelector(".p-tooltip")?.textContent?.trim()).toBe("V");

  tab!.dispatchEvent(new MouseEvent("mouseleave"));
  await flushTask();
  expect(document.querySelector(".p-tooltip")).toBeNull();
  wrapper.unmount();
  vi.unstubAllGlobals();
});
