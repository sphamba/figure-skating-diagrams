import { describe, expect, it } from "vitest";
import { defineComponent, nextTick, ref, type Ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { useVideoFps } from "../src/composables/useVideoFps";

type FrameMetadata = { mediaTime: number; presentedFrames: number };
type FrameCallback = (now: number, metadata: FrameMetadata) => void;

// The watch binds with flush post, so the element change settles on a tick.
async function flush() {
  await nextTick();
  await flushPromises();
}

function makeRecorder() {
  const callbacks: FrameCallback[] = [];
  const canceledHandles: number[] = [];
  let nextHandle = 0;
  const element = {
    requestVideoFrameCallback: (cb: FrameCallback) => {
      callbacks.push(cb);
      return nextHandle++;
    },
    cancelVideoFrameCallback: (id: number) => {
      canceledHandles.push(id);
    },
  } as unknown as HTMLVideoElement;
  return {
    element,
    callbacks,
    canceledHandles,
    // Presents one frame through the pending callback of the composable.
    present(mediaTime: number, presentedFrames: number) {
      const cb = callbacks[callbacks.length - 1];
      if (!cb) throw new Error("the composable requested no frame callback");
      cb(performance.now(), { mediaTime, presentedFrames });
    },
  };
}

describe("useVideoFps", () => {
  it("keeps the rate unknown on an element without rvfc support", async () => {
    const video = ref<HTMLVideoElement | null | undefined>(undefined);
    let fps: Ref<number | null> | undefined;
    const Host = defineComponent({
      setup() {
        fps = useVideoFps(video).fps;
        return () => null;
      },
      render: () => null,
    });
    const wrapper = mount(Host);
    video.value = document.createElement("video");
    await flush();
    expect(fps!.value).toBeNull();
    wrapper.unmount();
  });

  it("accepts the rate of two agreeing windows and stops measuring", async () => {
    const video = ref<HTMLVideoElement | null | undefined>(undefined);
    let fps: Ref<number | null> | undefined;
    const Host = defineComponent({
      setup() {
        fps = useVideoFps(video).fps;
        return () => null;
      },
      render: () => null,
    });
    const wrapper = mount(Host);
    const recorder = makeRecorder();
    video.value = recorder.element;
    await flush();
    recorder.present(0, 0);
    recorder.present(1, 30);
    expect(fps!.value, "a single window does not decide the rate").toBeNull();
    const pending = recorder.callbacks.length;
    recorder.present(2, 60);
    expect(fps!.value).toBe(30);
    expect(recorder.callbacks.length, "the measurement stops after the rate lands").toBe(pending);
    expect(recorder.canceledHandles.length, "the pending callback is canceled").toBe(1);
    wrapper.unmount();
  });

  it("keeps measuring while two windows disagree and accepts the third", async () => {
    const video = ref<HTMLVideoElement | null | undefined>(undefined);
    let fps: Ref<number | null> | undefined;
    const Host = defineComponent({
      setup() {
        fps = useVideoFps(video).fps;
        return () => null;
      },
      render: () => null,
    });
    const wrapper = mount(Host);
    const recorder = makeRecorder();
    video.value = recorder.element;
    await flush();
    recorder.present(0, 0);
    recorder.present(1, 30);
    recorder.present(2, 55);
    expect(fps!.value).toBeNull();
    expect(recorder.canceledHandles.length, "the pending callback stays alive").toBe(0);
    recorder.present(3, 80);
    expect(fps!.value).toBe(25);
    wrapper.unmount();
  });

  it("restarts the window after a seek and accepts a later clean pair", async () => {
    const video = ref<HTMLVideoElement | null | undefined>(undefined);
    let fps: Ref<number | null> | undefined;
    const Host = defineComponent({
      setup() {
        fps = useVideoFps(video).fps;
        return () => null;
      },
      render: () => null,
    });
    const wrapper = mount(Host);
    const recorder = makeRecorder();
    video.value = recorder.element;
    await flush();
    recorder.present(0, 0);
    recorder.present(5, 5);
    recorder.present(0, 6);
    recorder.present(1.5, 51);
    recorder.present(3, 96);
    expect(fps!.value).toBe(30);
    wrapper.unmount();
  });

  it("ignores the rates outside the plausible range", async () => {
    const video = ref<HTMLVideoElement | null | undefined>(undefined);
    let fps: Ref<number | null> | undefined;
    const Host = defineComponent({
      setup() {
        fps = useVideoFps(video).fps;
        return () => null;
      },
      render: () => null,
    });
    const wrapper = mount(Host);
    const recorder = makeRecorder();
    video.value = recorder.element;
    await flush();
    recorder.present(0, 0);
    recorder.present(1, 2);
    expect(fps!.value).toBeNull();
    recorder.present(2, 32);
    recorder.present(3, 62);
    expect(fps!.value).toBe(30);
    wrapper.unmount();
  });
});
