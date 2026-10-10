import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, nextTick } from "vue";
import type { Component } from "vue";

vi.spyOn(console, "error").mockImplementation(() => {});

const library = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/utils/diagramLibrary", async (importOriginal) => ({
  ...(await importOriginal<{ [key: string]: unknown }>()),
  listSavedDiagrams: library.list,
  saveSavedDiagram: library.save,
}));

// Stub matchMedia and ResizeObserver: jsdom does not implement them.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
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

// <Toast /> normally mounts in MainLayout; the wrapper hosts one so toast
// assertions work without the full layout.
async function mountSidebar() {
  const { default: sidebar } = await import("@/components/DiagramSidebarFiles.vue");
  const { default: Toast } = await import("openvue/toast");
  const { default: OpenVue } = await import("openvue/config");
  const { default: ConfirmationService } = await import("openvue/confirmationservice");
  const { default: Aura } = await import("@openvue/themes/aura");
  const { definePreset } = await import("@openuxkit/themes");
  const appPreset = definePreset(Aura, { semantic: { primary: { 50: "{sky.50}" } } });
  const wrapper = defineComponent({
    components: { Toast, Sidebar: sidebar },
    template: `<div><Toast /><Sidebar mode="home" /></div>`,
  });
  setActivePinia(createPinia());
  const mounted = mount(wrapper as unknown as Component, {
    attachTo: document.body,
    global: {
      plugins: [
        [
          OpenVue,
          { theme: { preset: appPreset, options: { prefix: "p", darkModeSelector: "system", cssLayer: false } } },
        ],
        [ConfirmationService],
      ],
    },
  });
  await nextTick();
  return mounted;
}

function buttonWithText(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll("button").find((button) => button.text() === text)!;
}

beforeEach(() => {
  localStorage.clear();
  library.list.mockResolvedValue(["Alpha"]);
  library.save.mockResolvedValue(true);
});

test("saving over an existing name asks for confirmation and then saves", async () => {
  const wrapper = await mountSidebar();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.loadFromJSON({ name: "Alpha", sequences: [] });
  await buttonWithText(wrapper, "Save").trigger("click");
  await vi.waitFor(() => expect(document.querySelector(".p-confirmdialog")).not.toBeNull());
  expect(document.querySelector(".p-confirmdialog")?.textContent).toContain("Alpha");
  document
    .querySelector(".p-confirmdialog-accept-button")!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await vi.waitFor(() => expect(library.save).toHaveBeenCalledWith("Alpha", expect.any(String)));
  expect(store.isUnsaved(), "the save marks the diagram saved").toBe(false);
  wrapper.unmount();
});

test("a failed save shows an error toast", async () => {
  library.list.mockResolvedValue([]);
  library.save.mockResolvedValue(false);
  const wrapper = await mountSidebar();
  await buttonWithText(wrapper, "Save").trigger("click");
  await vi.waitFor(() =>
    expect(document.querySelector(".p-toast")?.textContent).toContain("Could not save the diagram."),
  );
  wrapper.unmount();
});
