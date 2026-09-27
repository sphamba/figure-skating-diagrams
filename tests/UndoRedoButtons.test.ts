import { expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import UndoRedoButtons from "@/components/UndoRedoButtons.vue";

test("both buttons carry the disabled attribute when the flags are false", () => {
  const wrapper = mount(UndoRedoButtons, { props: { canUndo: false, canRedo: false } });
  const buttons = wrapper.findAll("button");
  expect(buttons).toHaveLength(2);
  expect(buttons[0]!.attributes("disabled")).toBeDefined();
  expect(buttons[1]!.attributes("disabled")).toBeDefined();
  expect(buttons[0]!.attributes("aria-label")).toBe("Undo the last change");
  expect(buttons[1]!.attributes("aria-label")).toBe("Redo the last undone change");
});

test("the undo button is enabled when canUndo is true and emits undo on click", async () => {
  const wrapper = mount(UndoRedoButtons, { props: { canUndo: true, canRedo: false } });
  const undo = wrapper.find("button[aria-label='Undo the last change']");
  expect(undo.attributes("disabled")).toBeUndefined();
  await undo.trigger("click");
  expect(wrapper.emitted("undo")).toHaveLength(1);
  expect(wrapper.emitted("redo")).toBeUndefined();
});

test("the redo button is enabled when canRedo is true and emits redo on click", async () => {
  const wrapper = mount(UndoRedoButtons, { props: { canUndo: false, canRedo: true } });
  const redo = wrapper.find("button[aria-label='Redo the last undone change']");
  expect(redo.attributes("disabled")).toBeUndefined();
  await redo.trigger("click");
  expect(wrapper.emitted("redo")).toHaveLength(1);
  expect(wrapper.emitted("undo")).toBeUndefined();
});

test("each button draws one curved arrow icon with an arrow head and a tail", () => {
  const wrapper = mount(UndoRedoButtons, { props: { canUndo: true, canRedo: true } });
  const icons = wrapper.findAll("svg");
  expect(icons).toHaveLength(2);
  for (const icon of icons) {
    expect(icon.attributes("viewBox")).toBe("0 0 24 24");
    expect(icon.attributes("stroke")).toBe("currentColor");
    expect(icon.attributes("stroke-width")).toBe("2.31");
    expect(icon.attributes("stroke-linecap")).toBe("round");
    expect(icon.attributes("stroke-linejoin")).toBe("round");
    expect(icon.findAll("path")).toHaveLength(2);
  }
});
