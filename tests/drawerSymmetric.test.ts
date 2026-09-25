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

async function mountDiagramPanel(mode: "home" | "editor" = "editor") {
  const { default: component } = await import("@/components/DiagramSidebarDiagram.vue");
  const { default: OpenVue } = await import("openvue/config");
  const { default: Aura } = await import("@openvue/themes/aura");
  const { definePreset } = await import("@openuxkit/themes");
  const appPreset = definePreset(Aura, { semantic: { primary: { 50: "{sky.50}" } } });
  setActivePinia(createPinia());
  const wrapper = mount(component as Component, {
    props: { mode, videoError: false },
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

beforeEach(() => {
  localStorage.clear();
});

test("editor mode shows the Symmetric checkbox, home mode hides it", async () => {
  const wrapper = await mountDiagramPanel();

  const checkbox = wrapper.find('input#diagram-symmetric[type="checkbox"]');
  expect(checkbox.exists()).toBe(true);
  expect(wrapper.find(".diagram-sidebar__symmetric-checkbox").exists()).toBe(true);
  expect(wrapper.text()).toContain("Symmetric");
  wrapper.unmount();

  const home = await mountDiagramPanel("home");
  expect(home.find(".diagram-sidebar__symmetric-checkbox").exists()).toBe(false);
  home.unmount();
});

test("toggling the checkbox writes the flag to the store and the storage", async () => {
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const wrapper = await mountDiagramPanel();
  const store = useSequenceEditorStore();
  expect(store.getDiagram().symmetric).toBeUndefined();

  const checkbox = wrapper.findComponent({ name: "Checkbox" });
  expect(checkbox.exists()).toBe(true);
  checkbox.vm.$emit("update:modelValue", true);
  await wrapper.vm.$nextTick();

  expect(store.getDiagram().symmetric).toBe(true);
  const stored = JSON.parse(localStorage.getItem("sequence-editor") as string) as { symmetric?: boolean };
  expect(stored.symmetric).toBe(true);
  expect(checkbox.props("modelValue")).toBe(true);

  checkbox.vm.$emit("update:modelValue", false);
  await wrapper.vm.$nextTick();
  expect(store.getDiagram().symmetric).toBe(false);
  wrapper.unmount();
});
