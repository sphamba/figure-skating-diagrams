import { expect, test, afterEach } from "vitest";
import { mount, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import DiagramSidebarHelp from "@/components/DiagramSidebarHelp.vue";
import type { HelpItem } from "@/components/DiagramSidebar.vue";
import OpenVue from "openvue/config";
import Aura from "@openvue/themes/aura";
import { useInputModeStore } from "@/stores/inputMode";

const helpItems: HelpItem[] = [
  { keys: ["leftDrag"], descriptions: ["moveView"] },
  { keys: ["wheel"], descriptions: ["zoom"] },
  { keys: ["oneFinger"], descriptions: ["moveView"] },
  { keys: ["twoFingers"], descriptions: ["pinchZoomDragView"] },
  { keys: ["plus"], descriptions: ["togglePlayback"] },
  { keys: ["space"], descriptions: ["togglePlayback"] },
];

let wrapper: VueWrapper | null = null;

function mountHelp(mode?: "mouseKeyboard" | "touch"): VueWrapper {
  const pinia = createPinia();
  setActivePinia(pinia);
  if (mode) useInputModeStore().mode = mode;
  wrapper = mount(DiagramSidebarHelp, {
    props: { helpItems },
    attachTo: document.body,
    global: {
      plugins: [pinia, [OpenVue, { theme: { preset: Aura } }]],
    },
  });
  return wrapper;
}

function hintTexts(): string[] {
  return (wrapper!.findAll("li.diagram-sidebar__hint-item") as DOMWrapper<Element>[]).map((row) => row.text());
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
  localStorage.clear();
});

test("the help list renders only the mouse and keyboard rows by default", () => {
  mountHelp();
  const texts = hintTexts();
  expect(texts).toHaveLength(4);

  const joined = texts.join("\n");
  expect(joined).toContain("left drag");
  expect(joined).toContain("wheel");
  expect(joined).toContain("+");
  expect(joined).toContain("space");
  expect(joined).not.toContain("one finger");
  expect(joined).not.toContain("two fingers");
  expect(joined).not.toContain("pinch to zoom");
});

test("the help list renders only the touch rows in touch mode", () => {
  mountHelp("touch");
  const texts = hintTexts();
  expect(texts).toHaveLength(2);

  const joined = texts.join("\n");
  expect(joined).toContain("one finger");
  expect(joined).toContain("two fingers");
  expect(joined).toContain("pinch to zoom");
  expect(joined).toContain("move the view");
  expect(joined).not.toContain("left drag");
  expect(joined).not.toContain("wheel");
  expect(joined).not.toContain("space");
  expect(joined).not.toContain("toggle the playback");
});

test("the help list switches live between the touch and mouseKeyboard modes", async () => {
  mountHelp();
  expect(hintTexts()).toHaveLength(4);
  expect(hintTexts().join("\n")).not.toContain("one finger");

  const store = useInputModeStore();
  store.mode = "touch";
  await nextTick();
  expect(hintTexts()).toHaveLength(2);
  expect(hintTexts().join("\n")).toContain("one finger");
  expect(hintTexts().join("\n")).toContain("two fingers");

  store.mode = "mouseKeyboard";
  await nextTick();
  expect(hintTexts()).toHaveLength(4);
  expect(hintTexts().join("\n")).not.toContain("one finger");
  expect(hintTexts().join("\n")).toContain("left drag");
});

test("the plus key row renders the translated plus label", () => {
  mountHelp();
  const tags = wrapper!.findAll(".p-tag");
  const plusTag = tags.find((tag) => tag.text() === "+");
  expect(plusTag).toBeDefined();
  expect(plusTag!.find(".diagram-sidebar__hint-label").text()).toBe("+");
  expect(wrapper!.text()).not.toContain("help.keys.plus");
});
