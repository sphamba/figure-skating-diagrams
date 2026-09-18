import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { Component } from "vue";
import Tooltip from "openvue/tooltip";
import type { Sequence } from "@/engine/sequence";

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
  const tag = wrapper.find(".diagram-sidebar__unsaved-tag");
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

test("the timing dialog commits the transition checkboxes onto the keyframe", async () => {
  const wrapper = await mountEditorView();
  await nextTick();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.loadFromJSON(timedDiagramJSON as never);
  await nextTick();
  await nextTick();

  const sequence = store.getDiagram().sequences[0] as Sequence;
  const keyframe = sequence.keyframes.time[0]!;
  expect(keyframe.transitionIn).toBe("linear");
  expect(keyframe.transitionOut).toBe("linear");

  recorder.editor.onTimingKeyframeChangeRequest(keyframe, false);
  await nextTick();
  await nextTick();

  const decelerate = document.getElementById("timing-decelerate-to") as HTMLInputElement;
  const accelerate = document.getElementById("timing-accelerate-from") as HTMLInputElement;
  expect(decelerate, "the decelerate checkbox should mount in the dialog").not.toBeNull();
  expect(accelerate, "the accelerate checkbox should mount in the dialog").not.toBeNull();
  expect(decelerate.checked, "both checkboxes should stay unchecked for a linear keyframe").toBe(false);
  expect(accelerate.checked).toBe(false);

  decelerate.click();
  await nextTick();

  const ok = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "OK");
  expect(ok, "the OK button of the timing dialog should mount").not.toBeUndefined();
  ok!.click();
  await nextTick();
  await nextTick();

  expect(keyframe.transitionIn, "decelerate should set the incoming transition to smooth").toBe("smooth");
  expect(keyframe.transitionOut, "the outgoing transition should stay linear").toBe("linear");

  recorder.editor.onTimingKeyframeChangeRequest(keyframe, false);
  await nextTick();
  await nextTick();
  const decelerateAgain = document.getElementById("timing-decelerate-to") as HTMLInputElement;
  const accelerateAgain = document.getElementById("timing-accelerate-from") as HTMLInputElement;
  expect(decelerateAgain.checked, "the checkboxes should prefill from the keyframe").toBe(true);
  expect(accelerateAgain.checked).toBe(false);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the editor receives the pane height getter as the occluded top", async () => {
  const wrapper = await mountEditorView();
  const stub = recorder.editor as unknown as { occludedTop: (() => number) | null };
  expect(typeof stub.occludedTop).toBe("function");
  wrapper.unmount();
  vi.unstubAllGlobals();
});

const activeModeText = (wrapper: Awaited<ReturnType<typeof mountEditorView>>) =>
  wrapper.find('[role="tab"][aria-selected="true"]').text().trim();

// The tooltip shows over a macrotask, so the test waits one timer tick.
const flushTask = () => new Promise((resolve) => setTimeout(resolve));

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
