import { afterEach, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import type { Component } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { bytesToBase64Url } from "@/utils/shareUrl";
import { gzipText } from "@/utils/jsonGzip";

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

let wrapper: Awaited<ReturnType<typeof mountHomeView>> | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mountHomeView(initialPath: string) {
  // The store hydrates from localStorage, so a previous test's diagram must not leak.
  localStorage.clear();
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

test("a valid share payload loads the diagram and strips the query", async () => {
  const payload = bytesToBase64Url(await gzipText(JSON.stringify({ name: "Shared", sequences: [] })));
  const { wrapper: mounted, router } = await mountHomeView(`/?d=${payload}`);
  wrapper = mounted;
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await vi.waitFor(() => expect(store.getDiagram().name).toBe("Shared"));
  expect(router.currentRoute.value.query.d).toBeUndefined();
});

test("a corrupt share payload shows the error notice and keeps the query", async () => {
  const { wrapper: mounted, router } = await mountHomeView("/?d=not-a-payload");
  wrapper = mounted;
  await settle();
  const note = document.querySelector("small.home-view__shared-link-error");
  expect(note?.textContent).toBe("The shared diagram could not be loaded.");
  expect(router.currentRoute.value.query.d).toBe("not-a-payload");
});

test("no share payload leaves the default diagram and no notice", async () => {
  const { wrapper: mounted } = await mountHomeView("/");
  wrapper = mounted;
  await settle();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  expect(store.getDiagram().name).not.toBe("Shared");
  expect(document.querySelector("small.home-view__shared-link-error")).toBeNull();
});

test("a valid path payload fetches the public file, strips the query and keeps the origin", async () => {
  const body = new TextEncoder().encode(JSON.stringify({ name: "Fetched", sequences: [] }));
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => body.buffer });
  vi.stubGlobal("fetch", fetchMock);
  const payload = encodeURIComponent("Moves in the field/x.json");
  const { wrapper: mounted, router } = await mountHomeView(`/?p=${payload}`);
  wrapper = mounted;
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await vi.waitFor(() => expect(store.getDiagram().name).toBe("Fetched"));
  await vi.waitFor(() => expect(router.currentRoute.value.query.p).toBeUndefined());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe(`${import.meta.env.BASE_URL}diagrams/Moves in the field/x.json`);
  expect(store.getSaveFilename()).toBe("x.json");
  expect(store.getBundledPath()).toBe("diagrams/Moves in the field/x.json");
});

test("a path payload outside the diagram tree shows the error notice and keeps the query", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const outsideTree = "/etc/passwd";
  const { wrapper: mounted, router } = await mountHomeView(`/?p=${encodeURIComponent(outsideTree)}`);
  wrapper = mounted;
  await settle();
  const note = document.querySelector("small.home-view__shared-link-error");
  expect(note?.textContent).toBe("The shared diagram could not be loaded.");
  expect(router.currentRoute.value.query.p, "the router hands the view the decoded text").toBe(outsideTree);
  expect(fetchMock, "a rejected payload never reaches the network").not.toHaveBeenCalled();
});
