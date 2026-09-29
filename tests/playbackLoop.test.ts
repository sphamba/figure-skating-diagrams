import { describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { usePlaybackLoop, type LoopStage } from "../src/composables/usePlaybackLoop";

type LoopHarness = {
  seconds: Ref<number>;
  playing: Ref<boolean>;
  setTimestamp: ReturnType<typeof vi.fn>;
  stage: Ref<LoopStage>;
  bounds: Ref<[number, number] | null>;
  drawWindow: Ref<[number, number] | null>;
  toggle: () => void;
};

// The composable reads plain refs, so the host only wires them and exposes the api.
function mountLoop(): LoopHarness {
  const seconds = ref(0);
  const playing = ref(false);
  const setTimestamp = vi.fn();
  let api: Omit<LoopHarness, "seconds" | "playing" | "setTimestamp"> | undefined;
  const Host = defineComponent({
    setup() {
      const result = usePlaybackLoop(seconds, playing, setTimestamp as unknown as (value: number) => void);
      api = { stage: result.stage, bounds: result.bounds, drawWindow: result.drawWindow, toggle: result.toggle };
      return () => null;
    },
    render: () => null,
  });
  mount(Host);
  return { seconds, playing, setTimestamp, ...api! };
}

describe("usePlaybackLoop", () => {
  it("arms on the first tap and stores A without bounds", () => {
    const loop = mountLoop();
    loop.seconds.value = 4.2;
    loop.toggle();
    expect(loop.stage.value).toBe("armed");
    expect(loop.bounds.value).toBeNull();
  });

  it("activates on the second tap with chronological bounds when B precedes A", () => {
    const loop = mountLoop();
    loop.seconds.value = 6;
    loop.toggle();
    loop.seconds.value = 2;
    loop.toggle();
    expect(loop.stage.value).toBe("active");
    expect(loop.bounds.value).toEqual([2, 6]);
  });

  it("cancels when the second tap lands on the same time as A", () => {
    const loop = mountLoop();
    loop.seconds.value = 3.5;
    loop.toggle();
    loop.toggle();
    expect(loop.stage.value).toBe("idle");
    expect(loop.bounds.value).toBeNull();
  });

  it("returns to idle on the third tap and restarts the cycle afterwards", () => {
    const loop = mountLoop();
    loop.seconds.value = 1;
    loop.toggle();
    loop.seconds.value = 5;
    loop.toggle();
    expect(loop.stage.value).toBe("active");
    loop.toggle();
    expect(loop.stage.value).toBe("idle");
    expect(loop.bounds.value).toBeNull();
    loop.seconds.value = 7;
    loop.toggle();
    expect(loop.stage.value).toBe("armed");
  });

  it("wraps a running playback back to the loop start at the loop end", async () => {
    const loop = mountLoop();
    loop.seconds.value = 5;
    loop.toggle();
    loop.seconds.value = 9;
    loop.toggle();
    loop.playing.value = true;
    loop.seconds.value = 9.05;
    await nextTick();
    expect(loop.setTimestamp).toHaveBeenCalledWith(5);
  });

  it("wraps again when continued playback reaches the loop end", async () => {
    const loop = mountLoop();
    loop.seconds.value = 5;
    loop.toggle();
    loop.seconds.value = 9;
    loop.toggle();
    loop.playing.value = true;
    loop.seconds.value = 9.05;
    await nextTick();
    loop.seconds.value = 5;
    loop.seconds.value = 9.02;
    await nextTick();
    expect(loop.setTimestamp).toHaveBeenCalledTimes(2);
    expect(loop.setTimestamp).toHaveBeenLastCalledWith(5);
  });

  it("wraps a playback that starts at or beyond the loop end", async () => {
    const loop = mountLoop();
    loop.seconds.value = 5;
    loop.toggle();
    loop.seconds.value = 9;
    loop.toggle();
    loop.seconds.value = 12;
    loop.playing.value = true;
    loop.seconds.value = 12.02;
    await nextTick();
    expect(loop.setTimestamp).toHaveBeenCalledWith(5);
  });

  it("clamps a paused scrub past the loop end back to the loop end", async () => {
    const loop = mountLoop();
    loop.seconds.value = 5;
    loop.toggle();
    loop.seconds.value = 9;
    loop.toggle();
    loop.seconds.value = 10;
    await nextTick();
    expect(loop.setTimestamp).toHaveBeenCalledWith(9);
  });

  it("clamps a paused scrub before the loop start back to the loop start", async () => {
    const loop = mountLoop();
    loop.seconds.value = 5;
    loop.toggle();
    loop.seconds.value = 9;
    loop.toggle();
    loop.seconds.value = 3;
    await nextTick();
    expect(loop.setTimestamp).toHaveBeenCalledWith(5);
  });

  it("clamps a user seek below the loop start while playing back to the loop start", async () => {
    const loop = mountLoop();
    loop.seconds.value = 5;
    loop.toggle();
    loop.seconds.value = 9;
    loop.toggle();
    loop.playing.value = true;
    loop.seconds.value = 3;
    await nextTick();
    expect(loop.setTimestamp).toHaveBeenCalledWith(5);
  });

  it("does not clamp a paused scrub inside the loop range", async () => {
    const loop = mountLoop();
    loop.seconds.value = 5;
    loop.toggle();
    loop.seconds.value = 9;
    loop.toggle();
    loop.seconds.value = 7;
    await nextTick();
    expect(loop.setTimestamp).not.toHaveBeenCalled();
  });

  it("gives no draw window while idle", () => {
    const loop = mountLoop();
    expect(loop.drawWindow.value).toBeNull();
  });

  it("draws the chronological span from A to the cursor while armed", () => {
    const loop = mountLoop();
    loop.seconds.value = 4;
    loop.toggle();
    expect(loop.drawWindow.value).toEqual([4, 4]);
    loop.seconds.value = 8;
    expect(loop.drawWindow.value).toEqual([4, 8]);
    // The cursor moves before A: the span stays chronological.
    loop.seconds.value = 2;
    expect(loop.drawWindow.value).toEqual([2, 4]);
  });

  it("draws the loop bounds while active and nothing after the third tap", () => {
    const loop = mountLoop();
    loop.seconds.value = 6;
    loop.toggle();
    loop.seconds.value = 3;
    loop.toggle();
    expect(loop.drawWindow.value).toEqual([3, 6]);
    loop.toggle();
    expect(loop.drawWindow.value).toBeNull();
  });
});
