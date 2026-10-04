import { afterEach, expect, test, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type { App } from "vue";
import { createPinia, setActivePinia } from "pinia";
import DiagramSidebarFiles from "@/components/DiagramSidebarFiles.vue";
import { PrimeVueConfirmSymbol } from "openvue/useconfirm";
import OpenVue from "openvue/config";
import Aura from "@openvue/themes/aura";

const toastAdd = vi.hoisted(() => vi.fn());
vi.mock("openvue/usetoast", () => ({ useToast: () => ({ add: toastAdd }) }));

// Stub matchMedia and ResizeObserver: jsdom does not implement them, and
// DiagramTree's Select needs both at mount.
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
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

function confirmServicePlugin() {
  return {
    install(app: App) {
      app.provide(PrimeVueConfirmSymbol, { require: vi.fn(), close: vi.fn() });
    },
  };
}

let wrapper: VueWrapper | null = null;

function stubNavigator(share: unknown, canShare: unknown, clipboard: unknown) {
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: canShare });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  stubNavigator(undefined, undefined, undefined);
  toastAdd.mockClear();
  vi.restoreAllMocks();
});

function mountFiles(): VueWrapper {
  const pinia = createPinia();
  setActivePinia(pinia);
  wrapper = mount(DiagramSidebarFiles, {
    props: { mode: "editor" },
    global: {
      plugins: [pinia, confirmServicePlugin(), [OpenVue, { theme: { preset: Aura } }]],
      directives: { tooltip: {}, ripple: {} },
    },
  });
  return wrapper;
}

function shareButton(component: VueWrapper) {
  const button = component.findAll("button").find((candidate) => candidate.text().includes("Share link"));
  expect(button, "the Share link button exists").toBeDefined();
  return button!;
}

function shareNotes(component: VueWrapper): string[] {
  return component.findAll("small.diagram-sidebar__share-note").map((note) => note.text());
}

function dialogTextarea(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(".diagram-sidebar__share-dialog__url");
}

// The share chain gzips through a stream pipeline, so the outcome lands a few
// macrotasks after the click.
async function settle(ms = 50) {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test("shareLink shares the built link when navigator.share works", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  const clipboard = { writeText: vi.fn() };
  stubNavigator(share, vi.fn(() => true), clipboard);
  const component = mountFiles();
  await shareButton(component).trigger("click");
  await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  await settle();
  expect(share.mock.calls[0][0].url).toContain("#/?d=");
  expect(clipboard.writeText).not.toHaveBeenCalled();
  expect(toastAdd).not.toHaveBeenCalled();
  expect(dialogTextarea()).toBeNull();
  expect(shareNotes(component)).toEqual([]);
});

test("shareLink falls back to the clipboard and shows a toast when navigator.share fails", async () => {
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  stubNavigator(vi.fn().mockRejectedValue(new DOMException("Unsupported platform.", "NotSupportedError")), vi.fn(() => true), clipboard);
  const component = mountFiles();
  await shareButton(component).trigger("click");
  await vi.waitFor(() =>
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "success", summary: "Link copied to the clipboard." })),
  );
  expect(clipboard.writeText).toHaveBeenCalledTimes(1);
  expect(dialogTextarea()).toBeNull();
});

test("shareLink falls back to the clipboard when Chrome cannot connect to the share service", async () => {
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  stubNavigator(
    vi.fn().mockRejectedValue(new DOMException("Internal error: could not connect to Web Share interface.", "AbortError")),
    vi.fn(() => true),
    clipboard,
  );
  const component = mountFiles();
  await shareButton(component).trigger("click");
  await vi.waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "success" })));
  expect(clipboard.writeText).toHaveBeenCalledTimes(1);
  expect(dialogTextarea()).toBeNull();
});

test("shareLink stays silent when the user cancels the share sheet", async () => {
  const share = vi.fn().mockRejectedValue(new DOMException("Share canceled", "AbortError"));
  const clipboard = { writeText: vi.fn() };
  stubNavigator(share, vi.fn(() => true), clipboard);
  const component = mountFiles();
  await shareButton(component).trigger("click");
  await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  await settle();
  expect(clipboard.writeText).not.toHaveBeenCalled();
  expect(toastAdd).not.toHaveBeenCalled();
  expect(dialogTextarea()).toBeNull();
  expect(shareNotes(component)).toEqual([]);
});

test("shareLink opens the dialog when the clipboard is missing", async () => {
  stubNavigator(undefined, undefined, undefined);
  const component = mountFiles();
  await shareButton(component).trigger("click");
  await vi.waitFor(() => expect(dialogTextarea()).not.toBeNull());
  expect(dialogTextarea()!.value).toMatch(/#\/\?d=/);
  expect(toastAdd).not.toHaveBeenCalled();
  await vi.waitFor(() => {
    expect(document.activeElement).toBe(dialogTextarea());
    const el = dialogTextarea()!;
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe(el.value.length);
  });
});

test("shareLink opens the dialog when the clipboard rejects", async () => {
  const clipboard = { writeText: vi.fn().mockRejectedValue(new Error("denied")) };
  stubNavigator(undefined, undefined, clipboard);
  const component = mountFiles();
  await shareButton(component).trigger("click");
  await vi.waitFor(() => expect(dialogTextarea()).not.toBeNull());
  expect(toastAdd).not.toHaveBeenCalled();
});

test("the dialog copy button copies the link, toasts, and closes the dialog", async () => {
  stubNavigator(undefined, undefined, undefined);
  const component = mountFiles();
  await shareButton(component).trigger("click");
  await vi.waitFor(() => expect(dialogTextarea()).not.toBeNull());
  const writeText = vi.fn().mockResolvedValue(undefined);
  stubNavigator(undefined, undefined, { writeText });
  const copyButton = [...document.querySelectorAll<HTMLButtonElement>(".diagram-sidebar__share-dialog button")].find((button) =>
    button.textContent?.includes("Copy to clipboard"),
  );
  expect(copyButton, "the dialog copy button exists").toBeDefined();
  copyButton!.click();
  await settle();
  await vi.waitFor(() => expect(dialogTextarea()).toBeNull());
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "success" }));
});
