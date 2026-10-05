import { beforeEach, expect, test, vi, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import type { App } from "vue";
import { createPinia, setActivePinia } from "pinia";
import DiagramSidebarSequences from "@/components/DiagramSidebarSequences.vue";
import { PrimeVueConfirmSymbol } from "openvue/useconfirm";
import OpenVue from "openvue/config";
import Aura from "@openvue/themes/aura";
import { useSequenceEditorStore } from "@/stores/sequenceEditor";
import { seedStoredDiagram } from "./helpers";
import { Curve } from "@/engine/curve";
import { Vector } from "@/engine/vector";
import type { Sequence } from "@/engine/sequence";

// The component calls useConfirm() at setup, which throws without the service.
function confirmServicePlugin() {
  return {
    install(app: App) {
      app.provide(PrimeVueConfirmSymbol, { require: vi.fn(), close: vi.fn() });
    },
  };
}

// The real tooltip directive ships with the app; the stub records the binding
// value so the tests can assert the texts without the overlay rendering.
const tooltipStub = {
  mounted(el: HTMLElement, binding: { value: unknown }) {
    el.dataset.testTooltip = String(binding.value);
  },
  updated(el: HTMLElement, binding: { value: unknown }) {
    el.dataset.testTooltip = String(binding.value);
  },
};

let wrapper: VueWrapper | null = null;

function mountSidebar(mode: "home" | "editor"): VueWrapper {
  const pinia = createPinia();
  setActivePinia(pinia);
  wrapper = mount(DiagramSidebarSequences, {
    props: { mode },
    attachTo: document.body,
    global: {
      plugins: [pinia, confirmServicePlugin(), [OpenVue, { theme: { preset: Aura } }]],
      directives: { tooltip: tooltipStub, ripple: {} },
    },
  });
  return wrapper;
}

async function settle(ticks = 2, ms = 50) {
  for (let i = 0; i < ticks; i++) await nextTick();
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function openActionDialog(ariaLabel: string): Promise<HTMLElement | null> {
  await wrapper!.find(`button[aria-label='${ariaLabel}']`).trigger("click");
  await settle();
  return document.querySelector(".diagram-sidebar__sequence-action-dialog");
}

function findFooterButton(dialog: HTMLElement, label: string): HTMLButtonElement | null {
  const buttons = [...dialog.querySelectorAll(".p-dialog-footer button")];
  return (buttons.find((button) => button.textContent?.trim() === label) as HTMLButtonElement | undefined) ?? null;
}

async function waitForRemoved(selector: string, timeoutMs = 600): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!document.querySelector(selector)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !document.querySelector(selector);
}

async function clickOption(dialog: HTMLElement, index = 0) {
  const option = dialog.querySelectorAll(".p-listbox-option")[index] as HTMLElement | undefined;
  expect(option).not.toBeUndefined();
  option!.click();
  await settle(1, 0);
}

// The suite starts from a stored one-sequence diagram instead of the empty default.
beforeEach(() => {
  seedStoredDiagram();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
  localStorage.clear();
});

test("the action buttons render in editor mode with tooltips, icons and no disabled state", () => {
  mountSidebar("editor");
  const duplicate = wrapper!.find("button[aria-label='Duplicate a sequence']");
  const horizontal = wrapper!.find("button[aria-label='Mirror a sequence horizontally']");
  const vertical = wrapper!.find("button[aria-label='Mirror a sequence vertically']");
  expect(duplicate.exists()).toBe(true);
  expect(horizontal.exists()).toBe(true);
  expect(vertical.exists()).toBe(true);

  expect(duplicate.find("span.pi-clone").exists()).toBe(true);
  expect(horizontal.find("span.pi-arrows-h").exists()).toBe(true);
  expect(vertical.find("span.pi-arrows-v").exists()).toBe(true);

  expect(duplicate.attributes("disabled")).toBeUndefined();
  expect(horizontal.attributes("disabled")).toBeUndefined();
  expect(vertical.attributes("disabled")).toBeUndefined();

  expect((duplicate.element as HTMLElement).dataset.testTooltip).toBe("duplicate");
  expect((horizontal.element as HTMLElement).dataset.testTooltip).toBe("mirror horizontally");
  expect((vertical.element as HTMLElement).dataset.testTooltip).toBe("mirror vertically");
});

test("the action buttons do not render in home mode", () => {
  mountSidebar("home");
  expect(wrapper!.find("button[aria-label='Duplicate a sequence']").exists()).toBe(false);
  expect(wrapper!.find("button[aria-label='Mirror a sequence horizontally']").exists()).toBe(false);
  expect(wrapper!.find("button[aria-label='Mirror a sequence vertically']").exists()).toBe(false);
});

test("clicking the duplicate button opens the dialog listing the sequences", async () => {
  mountSidebar("editor");
  const dialog = await openActionDialog("Duplicate a sequence");
  expect(dialog).not.toBeNull();
  expect(dialog!.querySelector(".p-dialog-title")?.textContent).toBe("Duplicate sequence");

  const listText = dialog!.querySelector(".p-listbox")?.textContent ?? "";
  expect(listText).toContain("Sequence 1");
  // One option with the L and R swatch letters.
  const options = dialog!.querySelectorAll(".p-listbox-option");
  expect(options).toHaveLength(1);
  const letters = [...options[0]!.querySelectorAll(".diagram-sidebar__swatch-letter")].map(
    (letter) => letter.textContent,
  );
  expect(letters).toEqual(["L", "R"]);
  // No preselection: the list starts unselected and the footer holds a single Cancel button.
  expect(dialog!.querySelectorAll(".p-listbox-option-selected")).toHaveLength(0);
  const footerButtons = [...dialog!.querySelectorAll(".p-dialog-footer button")];
  expect(footerButtons).toHaveLength(1);
  expect(footerButtons[0]!.textContent?.trim()).toBe("Cancel");
});

test("mirroring through the dialog mirrors the target path and emits redraw", async () => {
  mountSidebar("editor");
  const store = useSequenceEditorStore();
  const sequence = store.getSequences()[0] as Sequence;
  // An off-center path pins the mirror line: the bbox spans x in [1, 4], so the center sits at 2.5.
  sequence.path.curves = [new Curve(new Vector(1, 0), new Vector(2, 2), new Vector(3, -1), new Vector(4, 0))];
  sequence.path.updateLength();

  const dialog = await openActionDialog("Mirror a sequence horizontally");
  expect(dialog).not.toBeNull();
  await clickOption(dialog!);

  const curve = sequence.path.curves[0]!;
  expect(curve.p0.x).toBeCloseTo(4, 10);
  expect(curve.p0.y).toBeCloseTo(0, 10);
  expect(curve.p1.x).toBeCloseTo(3, 10);
  expect(curve.p1.y).toBeCloseTo(2, 10);
  expect(curve.p2.x).toBeCloseTo(2, 10);
  expect(curve.p2.y).toBeCloseTo(-1, 10);
  expect(curve.p3.x).toBeCloseTo(1, 10);
  expect(curve.p3.y).toBeCloseTo(0, 10);
  expect(wrapper!.emitted("redraw")).toHaveLength(1);
  expect(await waitForRemoved(".diagram-sidebar__sequence-action-dialog")).toBe(true);
});

test("duplicating through the dialog grows the store and activates the copy", async () => {
  mountSidebar("editor");
  const store = useSequenceEditorStore();
  expect(store.getSequences()).toHaveLength(1);

  const dialog = await openActionDialog("Duplicate a sequence");
  expect(dialog).not.toBeNull();
  // The option click applies the action directly: no OK button exists.
  expect(findFooterButton(dialog!, "OK")).toBeNull();
  await clickOption(dialog!);

  expect(store.getSequences()).toHaveLength(2);
  const copy = store.getSequences()[1] as Sequence;
  expect(store.getActiveSequence()).toBe(copy);
  expect(copy.name).toBe("Sequence 2");
  expect(await waitForRemoved(".diagram-sidebar__sequence-action-dialog")).toBe(true);
});

test("clicking an option in the mirror-vertical dialog mirrors the path y and emits redraw", async () => {
  mountSidebar("editor");
  const store = useSequenceEditorStore();
  const sequence = store.getSequences()[0] as Sequence;
  // An off-center path pins the mirror line: the bbox spans y in [-1, 2], so the center sits at 0.5.
  sequence.path.curves = [new Curve(new Vector(1, 0), new Vector(2, 2), new Vector(3, -1), new Vector(4, 0))];
  sequence.path.updateLength();

  const dialog = await openActionDialog("Mirror a sequence vertically");
  expect(dialog).not.toBeNull();
  await clickOption(dialog!);

  const curve = sequence.path.curves[0]!;
  expect(curve.p0.x).toBeCloseTo(1, 10);
  expect(curve.p0.y).toBeCloseTo(1, 10);
  expect(curve.p1.x).toBeCloseTo(2, 10);
  expect(curve.p1.y).toBeCloseTo(-1, 10);
  expect(curve.p2.x).toBeCloseTo(3, 10);
  expect(curve.p2.y).toBeCloseTo(2, 10);
  expect(curve.p3.x).toBeCloseTo(4, 10);
  expect(curve.p3.y).toBeCloseTo(1, 10);
  expect(wrapper!.emitted("redraw")).toHaveLength(1);
  expect(await waitForRemoved(".diagram-sidebar__sequence-action-dialog")).toBe(true);
});

test("the Cancel button hides the dialog without applying anything", async () => {
  mountSidebar("editor");
  const store = useSequenceEditorStore();
  expect(store.getSequences()).toHaveLength(1);
  const dialog = await openActionDialog("Duplicate a sequence");
  expect(dialog).not.toBeNull();

  const cancel = findFooterButton(dialog!, "Cancel");
  expect(cancel).not.toBeNull();
  cancel!.click();
  await settle();
  expect(await waitForRemoved(".diagram-sidebar__sequence-action-dialog")).toBe(true);
  expect(document.querySelector(".diagram-sidebar__sequence-action-dialog")).toBeNull();
  expect(store.getSequences()).toHaveLength(1);
  expect(store.getSequences()[0]!.name).toBe("Sequence 1");
});
