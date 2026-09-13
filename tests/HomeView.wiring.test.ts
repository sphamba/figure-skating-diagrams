import { expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { Component } from "vue";

vi.mock("virtual:diagram-tree", () => ({
  default: { name: "diagrams", files: [], folders: [] },
}));

vi.spyOn(console, "error").mockImplementation(() => {});

class EditorStub {
  clearSelection() {}
  requestDraw() {}
  setSequences() {}
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

function emitSelectStub(path: string) {
  return {
    template: `<div><button data-test="tree-open" @click="$emit('update:model-value', '${path}')">o</button></div>`,
  };
}

async function mountHomeView(selectPath: string | null, fetchOk: boolean, fetchResult: unknown) {
  if (!fetchOk) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
  } else {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(fetchResult), { status: 200 })),
    );
  }
  const { default: view } = await import("@/views/HomeView.vue");
  const { default: OpenVue } = await import("openvue/config");
  const { default: Aura } = await import("@openvue/themes/aura");
  const { definePreset } = await import("@openuxkit/themes");
  const appPreset = definePreset(Aura, { semantic: { primary: { 50: "{sky.50}" } } });
  setActivePinia(createPinia());
  const wrapper = mount(view as Component, {
    attachTo: document.body,
    global: {
      plugins: [[OpenVue, { theme: { preset: appPreset, options: { prefix: "p", darkModeSelector: "system", cssLayer: false } } }]],
      stubs: selectPath ? { Select: emitSelectStub(selectPath) } : {},
    },
  });
  await nextTick();
  return wrapper;
}

const videoFile = {
  name: "Video Diagram",
  bpm: 110,
  videoUrl: "https://example.com/video.mp4",
  sequences: [],
};

test("the tree loader mounts the player and fills the url", async () => {
  const wrapper = await mountHomeView("diagrams/test-video.json", true, videoFile);
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await wrapper.find('[data-test="tree-open"]').trigger("click");
  await nextTick();
  await nextTick();
  await nextTick();

  expect(store.getDiagram().videoUrl, "the store must keep the url").toBe("https://example.com/video.mp4");
  expect(store.getDiagram().bpm).toBe(110);
  const video = document.querySelector("video");
  expect(video, "the player should mount after load").not.toBeNull();
  expect(video?.getAttribute("src")).toBe("https://example.com/video.mp4");
  expect(document.querySelector(".home-view__sidebar")?.textContent)?.toContain("https://example.com/video.mp4");
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("a failed tree load clears the select and shows an error", async () => {
  const wrapper = await mountHomeView("diagrams/bad-file.json", false, videoFile);
  await wrapper.find('[data-test="tree-open"]').trigger("click");
  await nextTick();
  await nextTick();
  await nextTick();
  const small = document.querySelector(".home-view__load-error");
  expect(small !== null).toBe(true);
  wrapper.unmount();
  vi.unstubAllGlobals();
});
