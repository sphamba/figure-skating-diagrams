import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { Component } from "vue";
import Tooltip from "openvue/tooltip";

vi.spyOn(console, "error").mockImplementation(() => {});

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

async function mountDiagramPanel() {
  const { default: component } = await import("@/components/DiagramSidebarDiagram.vue");
  const { default: OpenVue } = await import("openvue/config");
  const { default: Aura } = await import("@openvue/themes/aura");
  const { definePreset } = await import("@openuxkit/themes");
  const appPreset = definePreset(Aura, { semantic: { primary: { 50: "{sky.50}" } } });
  setActivePinia(createPinia());
  const wrapper = mount(component as Component, {
    props: { mode: "editor" as const, videoError: false },
    attachTo: document.body,
    global: {
      plugins: [
        [
          OpenVue,
          { theme: { preset: appPreset, options: { prefix: "p", darkModeSelector: "system", cssLayer: false } } },
        ],
      ],
      directives: { tooltip: Tooltip },
    },
  });
  return wrapper;
}

const EXAMPLE_IMAGE = "data:image/png;base64,AAAA";

beforeEach(() => {
  localStorage.clear();
});

test("an unset background image shows the add button and a hidden file input", async () => {
  const wrapper = await mountDiagramPanel();

  const addButtons = wrapper.findAll("button").filter((button) => button.text().includes("Add background image"));
  expect(addButtons).toHaveLength(1);
  expect(wrapper.text()).not.toContain("Remove background image");
  expect(wrapper.findComponent({ name: "Slider" }).exists()).toBe(false);
  const fileInput = wrapper.find('input[type="file"][accept="image/*"]');
  expect(fileInput.exists()).toBe(true);
  expect(fileInput.attributes("hidden")).toBeDefined();
  wrapper.unmount();
});

test("a set image shows the remove button, the slider and a preview", async () => {
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const wrapper = await mountDiagramPanel();
  const store = useSequenceEditorStore();

  store.setDiagramBackgroundImage(EXAMPLE_IMAGE);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await wrapper.vm.$nextTick();

  const removeButtons = wrapper.findAll("button").filter((button) => button.text().includes("Remove background image"));
  expect(removeButtons).toHaveLength(1);
  expect(wrapper.text()).not.toContain("Add background image");
  const slider = wrapper.findComponent({ name: "Slider" });
  expect(slider.exists()).toBe(true);
  // The stored 0-1 opacity defaults to 1, so the slider starts at 100 percent.
  expect(slider.props("modelValue")).toBe(100);
  const preview = wrapper.find("img.diagram-sidebar__preview");
  expect(preview.exists()).toBe(true);
  expect(preview.attributes("src")).toBe(EXAMPLE_IMAGE);
  wrapper.unmount();
});

test("the slider writes the whole-percent opacity back to the store", async () => {
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const wrapper = await mountDiagramPanel();
  const store = useSequenceEditorStore();

  store.setDiagramBackgroundImage(EXAMPLE_IMAGE);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await wrapper.vm.$nextTick();

  const slider = wrapper.findComponent({ name: "Slider" });
  slider.vm.$emit("update:modelValue", 30);
  await wrapper.vm.$nextTick();
  expect(store.getDiagram().backgroundImageOpacity).toBeCloseTo(0.3);
  expect(slider.props("modelValue")).toBe(30);
  wrapper.unmount();
});

test("the remove button clears the image and brings the add button back", async () => {
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const wrapper = await mountDiagramPanel();
  const store = useSequenceEditorStore();

  store.setDiagramBackgroundImage(EXAMPLE_IMAGE);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await wrapper.vm.$nextTick();

  const removeButton = wrapper
    .findAll("button")
    .find((button) => button.text().includes("Remove background image"));
  removeButton?.trigger("click");
  await wrapper.vm.$nextTick();

  expect(store.getDiagram().backgroundImage).toBeUndefined();
  expect(wrapper.findAll("button").filter((button) => button.text().includes("Add background image"))).toHaveLength(1);
  wrapper.unmount();
});
