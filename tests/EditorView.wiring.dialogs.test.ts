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

  setBackgroundImage(dataUrl: string | undefined) {}

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

test("opening the element dialog inside an existing variant focuses the short name input", async () => {
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

  const input = document.getElementById("element-short-name");
  expect(input, "the short name step should mount on direct open").not.toBeNull();
  expect(document.activeElement, "the short name input should be focused").toBe(input);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("reaching the short name step from the previous step focuses the short name input", async () => {
  const wrapper = await mountEditorView();
  await nextTick();

  recorder.isProvisional = true;
  recorder.editor.onElementChangeRequest({
    type: "LeftForwardInsideThreeTurn",
    shortName: "",
    start: 0,
    end: 1,
  });
  await nextTick();
  await nextTick();

  const clickOption = async (label: string) => {
    const option = Array.from(document.querySelectorAll(".p-listbox-option")).find(
      (item) => item.textContent?.trim() === label,
    );
    expect(option, `the ${label} option should mount`).not.toBeUndefined();
    option!.click();
    await nextTick();
  };
  await clickOption("One-foot turn");
  await clickOption("Three-turn");
  await clickOption("Left");
  await clickOption("Forward");
  await clickOption("Inside");
  await nextTick();

  const input = document.getElementById("element-short-name");
  expect(input, "the short name step should mount after the last selection").not.toBeNull();
  expect(document.activeElement, "the short name input should be focused").toBe(input);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a one-foot glide shows edge options instead of an empty option list", async () => {
  const wrapper = await mountEditorView();
  await nextTick();

  recorder.isProvisional = true;
  recorder.editor.onElementChangeRequest({
    type: "LeftForwardInsideThreeTurn",
    shortName: "",
    start: 0,
    end: 1,
  });
  await nextTick();
  await nextTick();

  for (const label of ["Glide", "Left", "Forward"]) {
    const option = Array.from(document.querySelectorAll(".p-listbox-option")).find(
      (item) => item.textContent?.trim() === label,
    );
    expect(option, `the ${label} option should mount`).not.toBeUndefined();
    option!.click();
    await nextTick();
  }
  await nextTick();
  const edge = Array.from(document.querySelectorAll(".p-listbox-option")).find(
    (item) => item.textContent?.trim() === "Inside",
  );
  expect(edge, "the edge step should mount populated with options").not.toBeUndefined();
  edge!.click();
  await nextTick();
  await nextTick();
  expect(document.getElementById("element-short-name")).not.toBeNull();
  expect(document.activeElement?.id).toBe("element-short-name");
  wrapper.unmount();
  vi.unstubAllGlobals();
});
