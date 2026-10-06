import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { Component } from "vue";
import Tooltip from "openvue/tooltip";
import ColorPicker from "openvue/colorpicker";
import DiagramSidebar from "@/components/DiagramSidebar.vue";
import type { Sequence } from "@/engine/sequence";

vi.mock("virtual:diagram-tree", () => ({
  default: { name: "diagrams", files: [], folders: [] },
}));

vi.spyOn(console, "error").mockImplementation(() => {});

// Matches flag the matchMedia stub reads back, so tests mount as mobile or
// desktop without rebuilding the stub.
let mobileMatches = false;

const recorder = vi.hoisted(() => ({
  constructorArgs: [] as { sequences: unknown[] }[],
  hiddenSets: [] as unknown[],
  sequences: [] as unknown[],
  started: [] as unknown[],
  finished: 0,
  cancelled: 0,
  editor: null as unknown as {
    mode: string;
    onPathCreationChange: (state: unknown) => void;
    onSequenceCreationFinish: (sequence: Sequence) => void;
    onSequenceCreationCancel: (sequence: Sequence) => void;
  },
}));

class EditorStub {
  hiddenSequences: Set<unknown> = new Set();
  occludedTop: (() => number) | null = null;
  mode = "view";

  constructor(_canvas: unknown, sequences: unknown[], options?: { occludedTop?: () => number }) {
    this.occludedTop = options?.occludedTop ?? null;
    recorder.constructorArgs.push({ sequences });
    recorder.editor = this as unknown as {
      mode: string;
      onPathCreationChange: (state: unknown) => void;
      onSequenceCreationFinish: (sequence: Sequence) => void;
      onSequenceCreationCancel: (sequence: Sequence) => void;
    };
  }

  setHiddenSequences(next: unknown) {
    this.hiddenSequences = next;
    recorder.hiddenSets.push(next);
  }

  isProvisional() {
    return false;
  }

  isProvisionalAnnotation() {
    return false;
  }
  getSequenceOfElement() {
    return {};
  }

  replaceElementOf() {
    return null;
  }

  invalidateTimeCachesFor(_keyframe: unknown) {}

  setBackgroundImage(_dataUrl: string | undefined) {}

  refit() {}
  clearSelection() {}
  requestDraw() {}
  draw() {}
  setSequences(list: unknown[]) {
    recorder.sequences = list;
  }
  startSequenceCreation(sequence: unknown) {
    recorder.started.push(sequence);
    this.onPathCreationChange?.({ sequence, isNew: true, phase: "awaitStart", curveCount: 0 });
  }
  finishSequenceCreation() {
    recorder.finished += 1;
    return true;
  }
  cancelSequenceCreation() {
    recorder.cancelled += 1;
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
      matches: mobileMatches,
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
  // Callbacks are captured so wiring tests can fire observed resizes.
  static instances: ResizeObserverStub[] = [];
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverStub.instances.push(this);
  }

  observe() {}
  unobserve() {}
  disconnect() {}

  static fireAll() {
    for (const instance of ResizeObserverStub.instances) {
      instance.callback([], instance as unknown as ResizeObserver);
    }
  }
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
  await nextTick();
  return wrapper;
}

function pathToast() {
  return document.querySelector(".editor-view__path-toast-content");
}

function toastTexts(): string[] {
  return Array.from(pathToast()?.querySelectorAll("span") ?? []).map((span) => span.textContent?.trim() ?? "");
}

function toastButton(label: string): HTMLButtonElement | undefined {
  const button = Array.from(pathToast()?.querySelectorAll("button") ?? []).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  return button as HTMLButtonElement | undefined;
}

function dialogButton(label: string): HTMLButtonElement | undefined {
  const button = Array.from(document.querySelectorAll(".editor-view__sequence-finish-dialog button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  return button as HTMLButtonElement | undefined;
}

// Emulates the engine ordering: the creation state clears before the finish callback.
async function finishCreation(sequence: Sequence, isNew: boolean, curveCount = 1) {
  recorder.editor.onPathCreationChange({ sequence, isNew, phase: "placing", curveCount });
  await nextTick();
  recorder.editor.onPathCreationChange(null);
  await nextTick();
  recorder.editor.onSequenceCreationFinish(sequence);
  await nextTick();
  await nextTick();
}

// The real editor fires the callback on entry, so the stub state is driven here.
async function startCreation(sequence: Sequence, phase: "awaitStart" | "placing" = "awaitStart", curveCount = 0) {
  recorder.editor.onPathCreationChange({ sequence, isNew: true, phase, curveCount });
  await nextTick();
}

beforeEach(() => {
  localStorage.clear();
  mobileMatches = false;
  recorder.constructorArgs.length = 0;
  recorder.hiddenSets.length = 0;
  recorder.sequences = [];
  recorder.started.length = 0;
  recorder.finished = 0;
  recorder.cancelled = 0;
  recorder.editor = null;
  ResizeObserverStub.instances.length = 0;
});

test("a store creation request enters the path mode, starts the creation and consumes the request", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();

  const sequence = store.getSequences()[0] as Sequence;
  expect(recorder.started).toEqual([sequence]);
  expect(store.consumeCreationRequest()).toBeNull();
  expect(recorder.editor.mode).toBe("path");
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a creation request closes the bottom drawer only on mobile", async () => {
  mobileMatches = true;
  const wrapper = await mountEditorView();
  const sidebar = wrapper.findComponent(DiagramSidebar);
  sidebar.vm.$emit("update:open", true);
  await nextTick();
  expect(sidebar.props("open")).toBe(true);

  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();

  expect(wrapper.findComponent(DiagramSidebar).props("open")).toBe(false);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a creation request never closes the always-visible desktop sidebar", async () => {
  const wrapper = await mountEditorView();
  const sidebar = wrapper.findComponent(DiagramSidebar);
  sidebar.vm.$emit("update:open", true);
  await nextTick();
  expect(sidebar.props("open")).toBe(true);

  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();

  expect(wrapper.findComponent(DiagramSidebar).props("open")).toBe(true);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the creation toast is added once, updates in place and is removed on finish", async () => {
  const wrapper = await mountEditorView();
  const { default: ToastEventBus } = await import("openvue/toasteventbus");
  const emitSpy = vi.spyOn(ToastEventBus, "emit");
  const adds = () => emitSpy.mock.calls.filter(([type]) => type === "add").length;
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();

  // The creation start adds exactly one message.
  expect(adds()).toBe(1);
  const sequence = store.getSequences()[0] as Sequence;

  // Phase changes and point placements never remove or re-add the message.
  recorder.editor.onPathCreationChange({ sequence, isNew: true, phase: "placing", curveCount: 1 });
  await nextTick();
  recorder.editor.onPathCreationChange({ sequence, isNew: true, phase: "placing", curveCount: 2 });
  await nextTick();

  expect(adds()).toBe(1);
  expect(document.querySelectorAll(".p-toast-message")).toHaveLength(1);

  recorder.editor.onPathCreationChange(null);
  await nextTick();

  expect(document.querySelector(".p-toast-message")).toBeNull();
  expect(emitSpy.mock.calls.some(([type]) => type === "remove-group")).toBe(true);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the new-sequence toast renders only Cancel and content updates in place", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();

  expect(pathToast()).not.toBeNull();
  expect(toastTexts()).toContain("New sequence");
  expect(toastTexts()).toContain("Click to start a path");
  expect(toastButton("Finish")).toBeUndefined();
  expect(toastButton("Cancel")).not.toBeUndefined();

  const sequence = store.getSequences()[0] as Sequence;
  await startCreation(sequence, "placing", 0);

  expect(toastTexts()).toContain("Click to add point. Double click to finish");
  expect(toastButton("Finish")!.disabled).toBe(true);

  recorder.editor.onPathCreationChange({ sequence, isNew: true, phase: "placing", curveCount: 1 });
  await nextTick();

  expect(toastButton("Finish")!.disabled).toBe(false);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the extension toast keeps Finish gated on the curve count", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();

  const sequence = store.getSequences()[0] as Sequence;
  recorder.editor.onPathCreationChange({ sequence, isNew: false, phase: "awaitStart", curveCount: 0 });
  await nextTick();
  expect(toastButton("Finish")).toBeUndefined();

  recorder.editor.onPathCreationChange({ sequence, isNew: false, phase: "placing", curveCount: 0 });
  await nextTick();

  expect(toastTexts()).toContain("Add points");
  expect(toastButton("Finish")!.disabled).toBe(true);

  recorder.editor.onPathCreationChange({ sequence, isNew: false, phase: "placing", curveCount: 1 });
  await nextTick();

  expect(toastButton("Finish")!.disabled).toBe(false);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the toast wording follows the touch input mode", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const { useInputModeStore } = await import("@/stores/inputMode");
  const inputMode = useInputModeStore();
  inputMode.mode = "touch";
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();

  expect(toastTexts()).toContain("Touch to start a path");
  const sequence = store.getSequences()[0] as Sequence;
  await startCreation(sequence, "placing", 1);
  expect(toastTexts()).toContain("Touch to add point. Double touch to finish");
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the toast Finish button asks the editor to finish the creation", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();

  const sequence = store.getSequences()[0] as Sequence;
  recorder.editor.onPathCreationChange({ sequence, isNew: false, phase: "placing", curveCount: 1 });
  await nextTick();
  toastButton("Finish")!.click();
  await nextTick();

  expect(recorder.finished).toBe(1);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the toast Cancel button cancels and a new-sequence cancel removes the sequence from the store", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();
  const sequence = store.getSequences()[0] as Sequence;
  await startCreation(sequence);

  toastButton("Cancel")!.click();
  await nextTick();
  expect(recorder.cancelled).toBe(1);

  recorder.editor.onSequenceCreationCancel(sequence);
  await nextTick();
  expect(store.getSequences()).toHaveLength(0);
  expect(store.getActiveSequence()).toBeNull();
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("finishing a new sequence opens the dialog and Save applies the name and colors", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();
  const sequence = store.getSequences()[0] as Sequence;
  await startCreation(sequence);

  await finishCreation(sequence, true);

  const input = document.getElementById("sequence-finish-name") as HTMLInputElement | null;
  expect(input, "the finish dialog should open for a new sequence").not.toBeNull();
  expect(input!.value).toBe(sequence.name);

  const colorL = wrapper
    .findAllComponents(ColorPicker)
    .find((picker) => picker.attributes("id") === "sequence-finish-color-l");
  expect(colorL, "the finish dialog should show the left trace color picker").not.toBeUndefined();
  await colorL!.vm.$emit("update:modelValue", "00ff00");
  await nextTick();

  input!.value = "Renamed";
  input!.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  dialogButton("OK")!.click();
  await nextTick();
  await nextTick();

  expect(sequence.name).toBe("Renamed");
  expect(sequence.traceColorL).toBe("#00ff00");
  expect(sequence.traceColorR).toBe("#9c0000");
  expect(document.getElementById("sequence-finish-name"), "the dialog should close on save").toBeNull();
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the finish dialog color rows show swatches with letters beside their labels", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();
  const sequence = store.getSequences()[0] as Sequence;
  await startCreation(sequence);

  await finishCreation(sequence, true);

  expect(document.getElementById("sequence-finish-name"), "the finish dialog should open").not.toBeNull();

  const rows = document.querySelectorAll(".editor-view__sequence-finish-dialog .editor-view__finish-color-row");
  expect(rows, "each foot should render one swatch row").toHaveLength(2);

  const letters = [...document.querySelectorAll(".editor-view__finish-swatch-letter")].map((letter) =>
    letter.textContent?.trim(),
  );
  expect(letters).toEqual(["L", "R"]);

  const pickers = wrapper
    .findAllComponents(ColorPicker)
    .filter((picker) => (picker.attributes("id") ?? "").startsWith("sequence-finish-color"));
  expect(pickers, "each row should hold the color picker").toHaveLength(2);
  expect(pickers.map((picker) => picker.attributes("aria-label"))).toEqual(["Left trace color", "Right trace color"]);

  expect(document.querySelector('label[for="sequence-finish-color-l"]')?.textContent?.trim()).toBe("Left trace color");
  expect(document.querySelector('label[for="sequence-finish-color-r"]')?.textContent?.trim()).toBe("Right trace color");

  // The swatch mirrors the draft color and the picker still drives it.
  const swatch = document.querySelector(".editor-view__finish-swatch-wrapper") as HTMLElement | null;
  expect(swatch?.style.background).toBe("rgb(48, 48, 210)");
  const colorL = pickers.find((picker) => picker.attributes("id") === "sequence-finish-color-l");
  await colorL!.vm.$emit("update:modelValue", "00ff00");
  await nextTick();
  expect(swatch!.style.background).toBe("rgb(0, 255, 0)");

  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("closing the finish dialog keeps the default name and colors", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();
  const sequence = store.getSequences()[0] as Sequence;

  await finishCreation(sequence, true);

  const input = document.getElementById("sequence-finish-name") as HTMLInputElement;
  input.value = "Renamed";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  dialogButton("Cancel")!.click();
  await nextTick();
  await nextTick();

  expect(sequence.name).toBe("Sequence 1");
  expect(sequence.traceColorL).toBe("#3030d2");
  expect(sequence.traceColorR).toBe("#9c0000");
  expect(document.getElementById("sequence-finish-name")).toBeNull();
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("finishing an extension shows no dialog and closes the banner", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.loadFromJSON({
    name: "Diagram",
    sequences: [
      {
        name: "Existing",
        path: { curves: [{ points: [0, -1.2, 0, -1.2, 0, 1.2, 0, 1.2] }] },
        elements: [],
        keyframes: { footL: [], footR: [], hips: [], time: [] },
      },
    ],
  } as never);
  await nextTick();
  await nextTick();
  const sequence = store.getSequences()[0] as Sequence;

  recorder.editor.onPathCreationChange({ sequence, isNew: false, phase: "placing", curveCount: 1 });
  await nextTick();
  expect(pathToast()).not.toBeNull();
  expect(toastTexts()).toContain("Add points");

  await finishCreation(sequence, false);

  expect(document.getElementById("sequence-finish-name"), "the extension finish must not open a dialog").toBeNull();
  expect(pathToast(), "the toast should be removed after the extension finish").toBeNull();
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the toast buttons render small with a filled secondary Cancel and a primary Finish", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();
  const sequence = store.getSequences()[0] as Sequence;
  await startCreation(sequence, "placing", 1);

  const finish = toastButton("Finish")!;
  const cancel = toastButton("Cancel")!;
  // Finish stays default primary; Cancel is a filled secondary, never bare text.
  expect(finish.getAttribute("data-p-severity")).toBeNull();
  expect(finish.classList.contains("p-button-text")).toBe(false);
  expect(cancel.getAttribute("data-p-severity")).toBe("secondary");
  expect(cancel.classList.contains("p-button-text")).toBe(false);
  expect(finish.classList.contains("p-button-sm")).toBe(true);
  expect(cancel.classList.contains("p-button-sm")).toBe(true);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the path toast centers on the canvas area and follows its resizes", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();

  const canvasArea = wrapper.find(".editor-view__canvas-area").element as HTMLElement;
  canvasArea.getBoundingClientRect = () =>
    ({ left: 120, width: 400, top: 0, right: 520, bottom: 600, height: 600, x: 120, y: 0 }) as DOMRect;
  ResizeObserverStub.fireAll();
  await nextTick();
  await nextTick();

  const toast = document.querySelector(".editor-view__path-toast") as HTMLElement;
  expect(toast, "the teleported toast root should exist").not.toBeNull();
  expect(toast.style.left).toBe("320px"); // rect.left + rect.width / 2
  expect(toast.style.bottom).toBe("3.75rem");
  expect(toast.style.width).toBe("18.75rem");

  // A splitter or sidebar change resizes the canvas area and must move the toast.
  canvasArea.getBoundingClientRect = () =>
    ({ left: 260, width: 500, top: 0, right: 760, bottom: 600, height: 600, x: 260, y: 0 }) as DOMRect;
  ResizeObserverStub.fireAll();
  await nextTick();
  await nextTick();

  expect(toast.style.left).toBe("510px");
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the empty-canvas button starts a creation and hides once a sequence exists", async () => {
  const wrapper = await mountEditorView();
  const hint = document.querySelector(".editor-view__empty-hint");
  expect(hint).not.toBeNull();
  const addSequenceButton = Array.from(hint!.querySelectorAll("button") ?? []).find(
    (candidate) => candidate.textContent?.trim() === "Add sequence",
  );
  expect(addSequenceButton).not.toBeUndefined();
  expect(addSequenceButton!.querySelector(".pi-plus")).not.toBeNull();
  expect(addSequenceButton!.getAttribute("data-p-severity")).toBe("primary");

  addSequenceButton!.click();
  await nextTick();
  await nextTick();

  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  expect(recorder.started).toHaveLength(1);
  expect(store.consumeCreationRequest()).toBeNull();
  expect(document.querySelector(".editor-view__empty-hint")).toBeNull();
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the path creation drops the bundled origin", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.addSequence();
  await nextTick();
  await nextTick();
  const sequence = store.getSequences()[0] as Sequence;
  // The store request already saved, so the origin is re-set here to isolate
  // the drop the editor state itself must trigger.
  store.setBundledPath("diagrams/a.json");

  recorder.editor.onPathCreationChange({ sequence, isNew: false, phase: "placing", curveCount: 1 });
  await nextTick();

  expect(store.getBundledPath()).toBeNull();
  wrapper.unmount();
  vi.unstubAllGlobals();
});
