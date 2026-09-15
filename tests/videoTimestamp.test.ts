import { describe, expect, it } from "vitest";
import { defineComponent, ref, type Ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { useVideoTimestamp } from "../src/composables/useVideoTimestamp";

const video = ref<HTMLVideoElement | null | undefined>(undefined);
let seconds: Ref<number> | undefined;
let setTimestamp: ((value: number) => void) | undefined;

const Host = defineComponent({
  setup() {
    const result = useVideoTimestamp(video);
    seconds = result.seconds;
    setTimestamp = result.setTimestamp;
    return () => null;
  },
  render: () => null,
});

async function flush() {
  await Promise.resolve();
  await flushPromises();
}

function host() {
  return mount(Host);
}

describe("useVideoTimestamp", () => {
  it("reads the timestamp from the element events", async () => {
    host();
    const element = document.createElement("video");
    element.currentTime = 1.5;
    video.value = element;
    await flush();
    expect(seconds!.value).toBe(0);
    element.dispatchEvent(new Event("seeked"));
    await flush();
    expect(seconds!.value).toBe(1.5);
  });

  it("clamps setTimestamp against the duration", async () => {
    host();
    const element = document.createElement("video");
    Object.defineProperty(element, "duration", { value: 5 });
    video.value = element;
    await flush();
    setTimestamp!(7);
    await flush();
    expect(element.currentTime).toBe(5);
    expect(seconds!.value).toBe(5);
    setTimestamp!(2);
    await flush();
    expect(element.currentTime).toBe(2);
    expect(seconds!.value).toBe(2);
  });

  it("ignores stale completed seeks during rapid scrubbing", async () => {
    host();
    const element = document.createElement("video");
    video.value = element;
    await flush();
    setTimestamp!(1);
    setTimestamp!(3);
    // An intermediate completed seek reports its older position while the video
    // still catches up on the queued seeks.
    element.currentTime = 1;
    element.dispatchEvent(new Event("seeked"));
    await flush();
    expect(seconds!.value).toBe(3);
    // The final seek completes and matches the pending target.
    element.currentTime = 3;
    element.dispatchEvent(new Event("seeked"));
    await flush();
    expect(seconds!.value).toBe(3);
  });

  it("lets the video advance after play clears the seek target", async () => {
    const wrapper = host();
    const element = document.createElement("video");
    video.value = element;
    await flush();
    setTimestamp!(2);
    await flush();
    element.dispatchEvent(new Event("play"));
    element.dispatchEvent(new Event("playing"));
    await flush();
    element.currentTime = 2.5;
    element.dispatchEvent(new Event("seeked"));
    await flush();
    expect(seconds!.value).toBe(2.5);
    wrapper.unmount();
  });

  it("resets to zero when the element is removed", async () => {
    host();
    const element = document.createElement("video");
    video.value = element;
    await flush();
    element.dispatchEvent(new Event("timeupdate"));
    await flush();
    video.value = undefined;
    await flush();
    expect(seconds!.value).toBe(0);
  });
});
