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

const activeModeText = (wrapper: Awaited<ReturnType<typeof mountEditorView>>) =>
  wrapper.find('[role="tab"][aria-selected="true"]').text().trim();

test("V and P switch to the View and the Path modes", async () => {
  const wrapper = await mountEditorView();
  await nextTick();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "P" }));
  await nextTick();
  expect(activeModeText(wrapper)).toContain("Path");

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "V" }));
  await nextTick();
  expect(activeModeText(wrapper)).toContain("View");
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("E, T and A switch to the Elements, the Timing and the Annotations modes", async () => {
  const wrapper = await mountEditorView();
  await nextTick();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "T" }));
  await nextTick();
  expect(activeModeText(wrapper)).toContain("Timing");

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "E" }));
  await nextTick();
  expect(activeModeText(wrapper)).toContain("Elements");

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "A" }));
  await nextTick();
  expect(activeModeText(wrapper)).toContain("Annotations");
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a ctrl-modified mode letter does not switch modes", async () => {
  const wrapper = await mountEditorView();
  await nextTick();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "E", ctrlKey: true }));
  await nextTick();
  expect(activeModeText(wrapper)).toContain("View");
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a mode letter inside a focused input does not switch modes", async () => {
  const wrapper = await mountEditorView();
  await nextTick();
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();

  input.dispatchEvent(new KeyboardEvent("keydown", { key: "E", bubbles: true }));
  await nextTick();
  expect(activeModeText(wrapper)).toContain("View");
  input.remove();
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a mode letter inside an open dialog does not switch modes", async () => {
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

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "E" }));
  await nextTick();
  expect(activeModeText(wrapper)).toContain("View");
  wrapper.unmount();
  vi.unstubAllGlobals();
});
