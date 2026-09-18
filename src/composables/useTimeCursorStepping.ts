import type { Ref } from "vue";
import { useVideoFps } from "@/composables/useVideoFps";

// One video frame when the frame rate is known, otherwise 1/30 second.
const DEFAULT_STEP_FPS = 30;

type TimeCursorSteppingOptions = {
  seconds: Ref<number>;
  setTimestamp: (value: number) => void;
  extent: () => [number, number] | null;
  hasVideo: () => boolean;
};

// Shared by the home and the editor views: the arrows step the time cursor with
// the video frame rate when the rate is known.
export function useTimeCursorStepping(
  video: Ref<HTMLVideoElement | null | undefined>,
  options: TimeCursorSteppingOptions,
) {
  const { fps } = useVideoFps(video);

  function step(direction: 1 | -1) {
    const stepValue = 1 / (fps.value ?? DEFAULT_STEP_FPS);
    let next = options.seconds.value + direction * stepValue;
    // Without a video the extent end is the largest playable time.
    const hi = options.hasVideo() ? null : (options.extent()?.[1] ?? null);
    if (hi !== null) next = Math.min(next, hi);
    options.setTimestamp(Math.max(0, next));
  }

  return { step };
}
