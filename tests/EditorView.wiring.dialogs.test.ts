import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { Component } from "vue";
import Tooltip from "openvue/tooltip";
import { TimingKeyframe } from "@/engine/keyframe";
import type { PathCoordinate } from "@/engine/coordinates";

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
    onAnnotationChangeRequest: (annotation: unknown) => void;
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
      onAnnotationChangeRequest: (annotation: unknown) => void;
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

  isProvisionalAnnotation() {
    return recorder.isProvisional;
  }
  getSequenceOfElement() {
    return {};
  }

  replaceElementOf() {
    return null;
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

test("opening the annotation dialog focuses the title input", async () => {
  const wrapper = await mountEditorView();
  await nextTick();

  recorder.editor.onAnnotationChangeRequest({ title: "Spiral", description: "", color: "ff0000" });
  await nextTick();
  await nextTick();

  const input = document.getElementById("annotation-title");
  expect(input, "the title input should mount on open").not.toBeNull();
  expect(document.activeElement, "the title input should be focused").toBe(input);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("pressing Enter in the annotation title input commits the annotation", async () => {
  const wrapper = await mountEditorView();
  await nextTick();

  const annotation = { title: "Spiral", description: "", color: "ff0000" };
  recorder.editor.onAnnotationChangeRequest(annotation);
  await nextTick();
  await nextTick();

  const input = document.getElementById("annotation-title") as HTMLInputElement | null;
  expect(input).not.toBeNull();
  input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await nextTick();
  await nextTick();

  expect(annotation.title).toBe("Spiral");
  expect(document.getElementById("annotation-title"), "the dialog should close on commit").toBeNull();
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a keyup Enter on the opener press does not commit the annotation dialog", async () => {
  const wrapper = await mountEditorView();
  await nextTick();

  const annotation = { title: "Spiral", description: "", color: "ff0000" };
  recorder.editor.onAnnotationChangeRequest(annotation);
  await nextTick();
  await nextTick();

  const input = document.getElementById("annotation-title") as HTMLInputElement | null;
  expect(input).not.toBeNull();
  input!.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
  await nextTick();
  await nextTick();
  expect(document.getElementById("annotation-title"), "the opener keyup must not commit").not.toBeNull();

  input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await nextTick();
  await nextTick();
  expect(annotation.title).toBe("Spiral");
  expect(document.getElementById("annotation-title"), "the dialog should close on commit").toBeNull();
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a keyup Enter on the opener press does not commit the timing dialog", async () => {
  const wrapper = await mountEditorView();
  await nextTick();

  const keyframe = new TimingKeyframe(0.4 as PathCoordinate, "time", 4);
  recorder.editor.onTimingKeyframeChangeRequest(keyframe, false);
  await nextTick();
  await nextTick();

  const input = document.getElementById("timing-value") as HTMLInputElement | null;
  expect(input).not.toBeNull();
  input!.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
  await nextTick();
  await nextTick();
  expect(document.getElementById("timing-value"), "the opener keyup must not commit").not.toBeNull();

  input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await nextTick();
  await nextTick();
  expect(keyframe.value).toBe(4);
  expect(document.getElementById("timing-value"), "the dialog should close on commit").toBeNull();
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a keyup Enter on the opener press does not commit the element dialog", async () => {
  const wrapper = await mountEditorView();
  await nextTick();

  recorder.editor.onElementChangeRequest({ type: "LeftForwardInsideThreeTurn", shortName: "LFI-3T", start: 0, end: 1 });
  await nextTick();
  await nextTick();

  const input = document.getElementById("element-short-name") as HTMLInputElement | null;
  expect(input).not.toBeNull();
  input!.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
  await nextTick();
  await nextTick();
  expect(document.getElementById("element-short-name"), "the opener keyup must not commit").not.toBeNull();

  input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await nextTick();
  await nextTick();
  expect(document.getElementById("element-short-name"), "the dialog should close on commit").toBeNull();
  wrapper.unmount();
  vi.unstubAllGlobals();
});
