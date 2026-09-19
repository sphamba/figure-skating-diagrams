import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { useTooltipTouchGuard } from "../src/composables/useTooltipTouchGuard";

function setup() {
  const Host = defineComponent({
    setup() {
      useTooltipTouchGuard();
      return () => null;
    },
    render: () => null,
  });
  const wrapper = mount(Host);
  const target = document.createElement("div");
  document.body.appendChild(target);
  const probe = vi.fn();
  target.addEventListener("mouseenter", probe);
  return {
    wrapper,
    target,
    probe,
    dispatchTouchStart: () => document.dispatchEvent(new Event("touchstart")),
    dispatchEnter: () => target.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false })),
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("useTooltipTouchGuard", () => {
  it("suppresses a mouse enter after a recent touch", () => {
    const env = setup();
    env.dispatchTouchStart();
    env.dispatchEnter();
    expect(env.probe, "a tap emulated enter must not reach the tooltip listeners").not.toHaveBeenCalled();
    env.wrapper.unmount();
  });

  it("passes a plain mouse enter to the element", () => {
    const env = setup();
    env.dispatchEnter();
    expect(env.probe).toHaveBeenCalledTimes(1);
    env.wrapper.unmount();
  });

  it("stops suppressing after unmount", () => {
    const env = setup();
    env.dispatchTouchStart();
    env.wrapper.unmount();
    env.dispatchEnter();
    expect(env.probe, "the guard listeners must be removed with the view").toHaveBeenCalledTimes(1);
  });
});
