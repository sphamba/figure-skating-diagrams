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
