import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import type { Component } from "vue";

vi.mock("virtual:diagram-tree", () => ({
  default: {
    name: "diagrams",
    files: [{ name: "Bundled Top", path: "diagrams/bundled-top.json" }],
    folders: [
      {
        name: "Moves",
        files: [{ name: "Nested Diagram", path: "diagrams/Moves/nested.json" }],
        folders: [],
      },
    ],
  },
}));

const library = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/utils/diagramLibrary", async (importOriginal) => ({
  ...(await importOriginal<{ [key: string]: unknown }>()),
  listSavedDiagrams: library.list,
  deleteSavedDiagram: library.remove,
}));

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

async function mountLibrary() {
  const { default: component } = await import("@/components/DiagramTree.vue");
  const { default: OpenVue } = await import("openvue/config");
  const { default: ConfirmationService } = await import("openvue/confirmationservice");
  const { default: Aura } = await import("@openvue/themes/aura");
  const { definePreset } = await import("@openuxkit/themes");
  const appPreset = definePreset(Aura, { semantic: { primary: { 50: "{sky.50}" } } });
  const wrapper = mount(component as Component, {
    props: { visible: true, refreshKey: 0 },
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
  await vi.waitFor(() => expect(document.querySelectorAll(".p-tree-node-content").length).toBeGreaterThan(0));
  return wrapper;
}

function nodeLabels(): string[] {
  return [...document.querySelectorAll(".p-tree-node-label")].map((node) => node.textContent?.trim() ?? "");
}

beforeEach(() => {
  library.list.mockResolvedValue(["Alpha"]);
  library.remove.mockResolvedValue(true);
});

test("bundled content sits at the root level without a root folder", async () => {
  const wrapper = await mountLibrary();
  const labels = nodeLabels();
  expect(labels).toContain("Saved");
  expect(labels).toContain("Alpha");
  expect(labels).toContain("Bundled Top");
  expect(labels).toContain("Moves");
  expect(labels).not.toContain("Nested Diagram");
  expect(labels).not.toContain("diagrams");
  wrapper.unmount();
});

test("clicking a folder row toggles it open and closed", async () => {
  const wrapper = await mountLibrary();
  const folderRow = () =>
    [...document.querySelectorAll(".p-tree-node-content")].find((node) => node.textContent?.includes("Moves"));
  expect(folderRow(), "the root folder should render").toBeDefined();
  folderRow()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextTick();
  expect(nodeLabels()).toContain("Nested Diagram");
  folderRow()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextTick();
  expect(nodeLabels()).not.toContain("Nested Diagram");
  wrapper.unmount();
});

test("selecting a saved leaf emits the saved source and closes the dialog", async () => {
  const wrapper = await mountLibrary();
  const savedNode = [...document.querySelectorAll(".p-tree-node-content")].find((node) =>
    node.textContent?.includes("Alpha"),
  );
  expect(savedNode, "the expanded saved leaf should render").toBeDefined();
  savedNode!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextTick();
  expect(wrapper.emitted("select")).toEqual([[{ source: "saved", name: "Alpha" }]]);
  expect(wrapper.emitted("update:visible")).toEqual([[false]]);
  wrapper.unmount();
});

test("an empty Saved folder shows the grey empty placeholder", async () => {
  library.list.mockResolvedValue([]);
  const wrapper = await mountLibrary();
  await vi.waitFor(() => expect(nodeLabels()).toContain("empty"));
  const emptyRow = [...document.querySelectorAll(".p-tree-node-content")].find((node) =>
    node.textContent?.includes("empty"),
  );
  expect(emptyRow?.querySelector(".diagram-tree__empty"), "the placeholder should be grey").not.toBeNull();
  emptyRow!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextTick();
  expect(wrapper.emitted("select"), "the placeholder must not load anything").toBeUndefined();
  wrapper.unmount();
});

test("the trash button confirms and then deletes the saved diagram", async () => {
  const wrapper = await mountLibrary();
  const trash = document.querySelector('.p-tree-node-content [aria-label=\'Delete "Alpha"\']') as HTMLButtonElement | null;
  expect(trash, "the saved leaf should carry a trash button").not.toBeNull();
  trash!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(wrapper.emitted("select")).toBeUndefined();
  await vi.waitFor(() => expect(document.querySelector(".p-confirmdialog")).not.toBeNull());
  const accept = document.querySelector(".p-confirmdialog-accept-button") as HTMLButtonElement | null;
  expect(accept, "the delete confirmation should show an accept button").not.toBeNull();
  accept!.click();
  await vi.waitFor(() => expect(library.remove).toHaveBeenCalledWith("Alpha"));
  wrapper.unmount();
});
