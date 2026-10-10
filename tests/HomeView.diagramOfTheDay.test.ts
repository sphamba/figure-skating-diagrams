import { afterEach, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import type { Component } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { bytesToBase64Url } from "@/utils/shareUrl";
import { gzipText } from "@/utils/jsonGzip";

const previousPath = vi.hoisted(() => ({ value: "/" }));
vi.mock("@/router", () => ({
  getPreviousPath: () => previousPath.value,
}));

vi.mock("virtual:diagram-tree", () => ({
  default: { name: "diagrams", files: [], folders: [] },
}));

vi.spyOn(console, "error").mockImplementation(() => {});

class EditorStub {
  hiddenSequences: Set<unknown> = new Set();
  tracking = false;
  onTrackingChange?: () => void;

  trackingStage: "off" | "barycenter" | "cursor" = "off";

  refit() {}

  followTimeCursor() {
    this.trackingStage = this.trackingStage === "barycenter" ? "cursor" : "barycenter";
    this.tracking = true;
    this.onTrackingChange?.();
  }

  disableTracking() {
    this.tracking = false;
    this.onTrackingChange?.();
  }

  setHiddenSequences(next: unknown) {
    this.hiddenSequences = next;
  }

  clearSelection() {}
  setBackgroundImage(_dataUrl: string | undefined) {}
  requestDraw() {}
  setSequences(_list: unknown[]) {}
  destroy() {}
}

vi.mock("@/engine/sequenceEditor/editor", async (importOriginal) => ({
  ...(await importOriginal<{ [key: symbol]: unknown }>()),
  Editor: EditorStub,
}));

// Stub matchMedia: jsdom does not implement it.
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

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

const DIAGRAM_OF_THE_DAY_PATH = "diagrams/Moves in the field/04. Juvenile/06. Forward Double Three-Turns.json";

let wrapper: Awaited<ReturnType<typeof mountHomeView>> | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  previousPath.value = "/";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mountHomeView(initialPath: string, storedJson?: string) {
  // The store hydrates from localStorage, so a previous test's diagram must not leak.
  localStorage.clear();
  if (storedJson) localStorage.setItem("sequence-editor", storedJson);
  const { default: view } = await import("@/views/HomeView.vue");
  const { default: OpenVue } = await import("openvue/config");
  const { default: ConfirmationService } = await import("openvue/confirmationservice");
  const { default: Aura } = await import("@openvue/themes/aura");
  const { definePreset } = await import("@openuxkit/themes");
  const appPreset = definePreset(Aura, { semantic: { primary: { 50: "{sky.50}" } } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div/>" } }],
  });
  router.push(initialPath);
  await router.isReady();
  setActivePinia(createPinia());
  const mounted = mount(view as Component, {
    attachTo: document.body,
    global: {
      plugins: [
        router,
        [OpenVue, { theme: { preset: appPreset, options: { prefix: "p", darkModeSelector: "system", cssLayer: false } } }],
        [ConfirmationService],
      ],
    },
  });
  await nextTick();
  return { wrapper: mounted, router };
}

async function settle() {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 50));
}

function stubDiagramOfTheDayFetch(name = "Forward Double Three-Turns") {
  const body = new TextEncoder().encode(
    JSON.stringify({
      name,
      sequences: [
        { name: "Sequence", path: { curves: [] }, elements: [], keyframes: { footL: [], footR: [], hips: [], time: [] } },
      ],
    }),
  );
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => body.buffer });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

test("an empty store on the home page loads the diagram of the day", async () => {
  stubDiagramOfTheDayFetch();
  const { wrapper: mounted } = await mountHomeView("/");
  wrapper = mounted;
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await vi.waitFor(() => expect(store.getSequences().length).toBe(1));
  expect(store.getDiagram().name).toBe("Forward Double Three-Turns");
  expect(store.getBundledPath()).toBe(DIAGRAM_OF_THE_DAY_PATH);
  expect(store.getSaveFilename()).toBe("06. Forward Double Three-Turns.json");
  expect(document.querySelector("div.home-view__empty-hint")).toBeNull();
});

test("the stored diagram is not empty, so the diagram of the day stays out", async () => {
  const fetchMock = stubDiagramOfTheDayFetch();
  const storedJson = JSON.stringify({
    name: "Diagram",
    sequences: [
      { name: "Sequence 1", path: { curves: [] }, elements: [], keyframes: { footL: [], footR: [], hips: [], time: [] } },
    ],
  });
  const { wrapper: mounted } = await mountHomeView("/", storedJson);
  wrapper = mounted;
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await settle();
  expect(store.getDiagram().name).toBe("Diagram");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("coming back from the editor keeps the empty diagram", async () => {
  const fetchMock = stubDiagramOfTheDayFetch();
  previousPath.value = "/editor";
  const { wrapper: mounted } = await mountHomeView("/");
  wrapper = mounted;
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await settle();
  expect(store.getSequences().length).toBe(0);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(document.querySelector("div.home-view__empty-hint")).not.toBeNull();
});

test("a failed fetch falls back to the empty diagram", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("offline")),
  );
  const { wrapper: mounted } = await mountHomeView("/");
  wrapper = mounted;
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await settle();
  expect(store.getSequences().length).toBe(0);
  expect(document.querySelector("div.home-view__empty-hint")).not.toBeNull();
});

test("a share payload wins over the diagram of the day", async () => {
  const fetchMock = stubDiagramOfTheDayFetch();
  const payload = bytesToBase64Url(await gzipText(JSON.stringify({ name: "Shared", sequences: [] })));
  const { wrapper: mounted, router } = await mountHomeView(`/?d=${payload}`);
  wrapper = mounted;
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await vi.waitFor(() => expect(store.getDiagram().name).toBe("Shared"));
  expect(router.currentRoute.value.query.d).toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
});
