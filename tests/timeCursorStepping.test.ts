import { describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useTimeCursorStepping } from "../src/composables/useTimeCursorStepping";

function setup() {
  const video = ref<HTMLVideoElement | null | undefined>(undefined);
  const seconds = ref(0);
  const extent = ref<[number, number] | null>(null);
  const hasVideo = ref(false);
  const timestamps: number[] = [];
  let step: ((direction: 1 | -1) => void) | undefined;
  const Host = defineComponent({
    setup() {
      ({ step } = useTimeCursorStepping(video, {
        seconds,
        setTimestamp: (value: number) => {
          seconds.value = value;
          timestamps.push(value);
        },
        extent: () => extent.value,
        hasVideo: () => hasVideo.value,
      }));
      return () => null;
    },
    render: () => null,
  });
  const addEventListener = vi.spyOn(window, "addEventListener");
  const wrapper = mount(Host);
  return {
    wrapper,
    seconds,
    extent,
    hasVideo,
    timestamps,
    step: () => step!,
    addEventListener,
  };
}

describe("useTimeCursorStepping", () => {
  it("steps 1/30 second with no video element and no extent", () => {
    const env = setup();
    env.step()(1);
    expect(env.timestamps).toEqual([1 / 30]);
    env.step()(-1);
    expect(env.timestamps, "the lower clamp keeps the cursor at zero").toEqual([1 / 30, 0]);
    env.wrapper.unmount();
  });

  it("steps from the current time instead of jumping to the extent start", () => {
    const env = setup();
    env.extent.value = [2, 4];
    env.step()(1);
    expect(env.timestamps[0], "the first forward step must not jump to the extent start").toBeCloseTo(1 / 30);
    env.wrapper.unmount();
  });

  it("clamps the step into the extent end and steps back inside", () => {
    const env = setup();
    env.extent.value = [2, 4];
    env.seconds.value = 3.99;
    env.step()(1);
    expect(env.timestamps).toEqual([4]);
    env.step()(-1);
    expect(env.timestamps[1], "a backward step inside the extent stays unclamped").toBeCloseTo(4 - 1 / 30);
    env.wrapper.unmount();
  });

  it("ignores the extent when a video is loaded", () => {
    const env = setup();
    env.extent.value = [0, 4];
    env.hasVideo.value = true;
    env.seconds.value = 3.99;
    env.step()(1);
    expect(env.timestamps[0], "the step stays unclamped; the video duration clamps instead").toBeCloseTo(
      3.99 + 1 / 30,
    );
    env.wrapper.unmount();
  });

  it("registers no window listeners", () => {
    const env = setup();
    const keyListeners = env.addEventListener.mock.calls.filter(([type]) => type === "keydown");
    expect(keyListeners, "the key binding belongs to useTimeCursorKeys").toHaveLength(0);
    env.wrapper.unmount();
  });
});
