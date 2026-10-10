import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { nextTick } from "vue";
import type { Component } from "vue";

vi.mock("virtual:diagram-tree", () => ({
  default: { name: "diagrams", files: [], folders: [] },
}));

vi.spyOn(console, "error").mockImplementation(() => {});

// jsdom has no canvas context, so the Editor engine is stubbed.
class EditorStub {
  hiddenSequences: Set<unknown> = new Set();
  tracking = false;
  onTrackingChange?: () => void;
  trackingStage: "off" | "barycenter" | "cursor" = "off";

  refit() {}
  followTimeCursor() {}
  disableTracking() {}
  setHiddenSequences(next: unknown) {
    this.hiddenSequences = next as Set<unknown>;
  }
  clearSelection() {}
  setBackgroundImage() {}
  requestDraw() {}
  setSequences() {}
  destroy() {}
}

vi.mock("@/engine/sequenceEditor/editor", async (importOriginal) => ({
  ...(await importOriginal<{ [key: symbol]: unknown }>()),
  Editor: EditorStub,
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

async function mountHomeView() {
  const { default: view } = await import("@/views/HomeView.vue");
  const { default: OpenVue } = await import("openvue/config");
  const { default: ConfirmationService } = await import("openvue/confirmationservice");
  const { default: Aura } = await import("@openvue/themes/aura");
  const { definePreset } = await import("@openuxkit/themes");
  const appPreset = definePreset(Aura, { semantic: { primary: { 50: "{sky.50}" } } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/editor", component: { template: "<div />" } },
    ],
  });
  await router.push("/");
  setActivePinia(createPinia());
  const wrapper = mount(view as Component, {
    attachTo: document.body,
    global: {
      plugins: [
        router,
        [
          OpenVue,
          { theme: { preset: appPreset, options: { prefix: "p", darkModeSelector: "system", cssLayer: false } } },
        ],
        [ConfirmationService],
      ],
    },
  });
  await nextTick();
  return { wrapper, router };
}

function emptyHintButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.find(".home-view__empty-hint").findAll("button").find((button) => button.text() === text);
}

const emptyDiagram = { name: "Alpha", sequences: [] };

const oneSequenceDiagram = {
  name: "One",
  sequences: [
    {
      name: "s",
      path: { curves: [{ points: [0, -1.2, 0, -1.2, 0, 1.2, 0, 1.2] }] },
      elements: [],
      keyframes: { footL: [], footR: [], hips: [], time: [] },
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

test("an empty diagram shows the load and editor buttons on the canvas", async () => {
  const { wrapper } = await mountHomeView();
  const hint = wrapper.find(".home-view__empty-hint");
  expect(hint.exists()).toBe(true);
  expect(emptyHintButton(wrapper, "Load")).toBeDefined();
  expect(emptyHintButton(wrapper, "Open in editor")).toBeDefined();
  wrapper.unmount();
});

test("a diagram with a sequence hides the buttons", async () => {
  const { wrapper } = await mountHomeView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  useSequenceEditorStore().loadFromJSON(oneSequenceDiagram);
  await nextTick();
  expect(wrapper.find(".home-view__empty-hint").exists()).toBe(false);
  wrapper.unmount();
});

test("the canvas load button opens the library dialog", async () => {
  const { wrapper } = await mountHomeView();
  await emptyHintButton(wrapper, "Load")!.trigger("click");
  await nextTick();
  expect(document.querySelector(".p-dialog.diagram-tree__dialog"), "the library dialog opens").not.toBeNull();
  wrapper.unmount();
});

test("the canvas load button opens the library dialog even on mobile with the drawer closed", async () => {
  // The sidebar dialog hosts outside the mobile drawer, so the canvas button
  // must open it while the drawer is closed.
  (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  const { wrapper } = await mountHomeView();
  await emptyHintButton(wrapper, "Load")!.trigger("click");
  await nextTick();
  expect(document.querySelector(".p-dialog.diagram-tree__dialog"), "the library dialog opens on mobile").not.toBeNull();
  wrapper.unmount();
});

test("the canvas editor button navigates to the editor page", async () => {
  const { wrapper, router } = await mountHomeView();
  await emptyHintButton(wrapper, "Open in editor")!.trigger("click");
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/editor"));
  wrapper.unmount();
});

test("an unsaved empty diagram asks for confirmation before opening the library", async () => {
  const { wrapper } = await mountHomeView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.loadFromJSON(emptyDiagram);
  store.setDiagramVideoUrl("https://example.com/video.mp4");
  expect(store.isUnsaved()).toBe(true);
  await emptyHintButton(wrapper, "Load")!.trigger("click");
  await nextTick();
  expect(document.querySelector(".p-confirmdialog"), "the unsaved guard asks first").not.toBeNull();
  expect(document.querySelector(".p-dialog.diagram-tree__dialog")).toBeNull();
  document.querySelector(".p-confirmdialog-accept-button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await vi.waitFor(() => expect(document.querySelector(".p-dialog.diagram-tree__dialog")).not.toBeNull());
  wrapper.unmount();
});
