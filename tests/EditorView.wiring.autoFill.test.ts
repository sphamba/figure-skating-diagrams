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

test("the Auto button fills the compatible variant steps and stops where marks end", async () => {
  const { LeftForwardOpenMohawk } = await import("@/engine/element/mohawk");
  const { changeElementType } = await import("@/engine/element/turnTypes");
  const wrapper = await mountEditorView();
  await nextTick();

  recorder.isProvisional = true;
  recorder.editor.onElementChangeRequest(new LeftForwardOpenMohawk("footL", 0, 1));
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
  await clickOption("Two-feet turn");
  await clickOption("Mohawk");
  await nextTick();

  const auto = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Auto");
  expect(auto, "the Auto button should show on a step with a compatible variant").not.toBeUndefined();
  auto!.click();
  await nextTick();
  await nextTick();

  expect(
    Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === "Auto"),
    "the Auto button should hide once the compatible variants are exhausted",
  ).toBe(false);
  const openness = Array.from(document.querySelectorAll(".p-listbox-option")).find(
    (item) => item.textContent?.trim() === "Open",
  );
  expect(openness, "the auto selection should stop at the first step without marks").not.toBeUndefined();

  await clickOption("Open");
  await nextTick();

  const input = document.getElementById("element-short-name") as HTMLInputElement;
  expect(input, "the short name step should mount after the last variant").not.toBeNull();
  expect(document.activeElement, "the short name input should be focused").toBe(input);
  const candidate = changeElementType("LeftForwardOpenMohawk", { type: "LeftForwardOpenMohawk", start: 0, end: 1 });
  expect(input.value, "the default short name should stay untouched").toBe(candidate.defaultShortName);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the Auto button fills a one-foot glide to the short name step", async () => {
  const { LeftForwardInsideGlide } = await import("@/engine/element/glide");
  const { changeElementType } = await import("@/engine/element/turnTypes");
  const wrapper = await mountEditorView();
  await nextTick();

  recorder.isProvisional = true;
  recorder.editor.onElementChangeRequest(new LeftForwardInsideGlide(0, 1));
  await nextTick();
  await nextTick();

  const clickGlideOption = async (label: string) => {
    const option = Array.from(document.querySelectorAll(".p-listbox-option")).find(
      (item) => item.textContent?.trim() === label,
    );
    expect(option, `the ${label} option should mount`).not.toBeUndefined();
    option!.click();
    await nextTick();
  };
  await clickGlideOption("Glide");
  await clickGlideOption("Left");
  await nextTick();

  const findAuto = () =>
    Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Auto");
  const auto = findAuto();
  expect(auto, "the Auto button should show after the foot is selected").not.toBeUndefined();
  auto!.click();
  await nextTick();
  await nextTick();

  expect(findAuto(), "the Auto button should hide once the glide is complete").toBeUndefined();
  const input = document.getElementById("element-short-name") as HTMLInputElement;
  expect(input, "the short name step should mount after the auto selection").not.toBeNull();
  // The mock computes the forward direction and the outside edge: the auto fill
  // reaches the LeftForwardOutsideGlide default short name.
  const candidate = changeElementType("LeftForwardOutsideGlide", { type: "LeftForwardOutsideGlide", start: 0, end: 1 });
  expect(input.value, "the auto fill should pick the valid direction and edge").toBe(candidate.defaultShortName);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the Auto button fills stroke variants and stops at the crossed step", async () => {
  const { LeftNormalForwardInsideGlide } = await import("@/engine/element/stroke");
  const { changeElementType } = await import("@/engine/element/turnTypes");
  const wrapper = await mountEditorView();
  await nextTick();

  recorder.isProvisional = true;
  recorder.editor.onElementChangeRequest(new LeftNormalForwardInsideGlide(0, 1));
  await nextTick();
  await nextTick();

  const clickStrokeOption = async (label: string) => {
    const option = Array.from(document.querySelectorAll(".p-listbox-option")).find(
      (item) => item.textContent?.trim() === label,
    );
    expect(option, `the ${label} option should mount`).not.toBeUndefined();
    option!.click();
    await nextTick();
  };
  await clickStrokeOption("Stroke");
  await clickStrokeOption("Left");
  await nextTick();

  const findAuto = () =>
    Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Auto");
  const auto = findAuto();
  expect(auto, "the Auto button should show after the foot is selected").not.toBeUndefined();
  auto!.click();
  await nextTick();
  await nextTick();

  expect(findAuto(), "the Auto button should hide if the crossed step shows no marks").toBeUndefined();
  const normal = Array.from(document.querySelectorAll(".p-listbox-option")).find(
    (item) => item.textContent?.trim() === "Normal",
  );
  expect(normal, "the auto selection should stop at the first step without marks").not.toBeUndefined();
  await clickStrokeOption("Normal");

  const input = document.getElementById("element-short-name") as HTMLInputElement;
  expect(input, "the short name step should mount after the last variant").not.toBeNull();
  // The mock computes the forward direction and the outside edge: the stroke
  // stays on the left foot forwarded and outside with the normal stroke kind.
  const filled = changeElementType("LeftNormalForwardOutsideGlide", {
    type: "LeftNormalForwardOutsideGlide",
    start: 0,
    end: 1,
  });
  expect(input.value, "the auto fill should pick the valid direction and edge").toBe(filled.defaultShortName);
  wrapper.unmount();
  vi.unstubAllGlobals();
});
