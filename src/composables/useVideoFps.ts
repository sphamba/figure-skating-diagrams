import { onBeforeUnmount, ref, watch, type Ref } from "vue";

// The video element has no standard frame rate property, so the rate comes from
// the number of presented frames during the media time of two windows.
const MIN_MEDIA_SPAN = 1; // seconds of media time in one measurement window
const RATE_TOLERANCE = 0.03;
const MIN_RATE = 10;
const MAX_RATE = 240;

type FrameSample = { mediaTime: number; presentedFrames: number };

// Frame rate of the video element, or null while it is unknown. The measurement
// runs only while frames are presented (playback or scrubbing); the composable never
// plays the video itself.
export function useVideoFps(video: Ref<HTMLVideoElement | null | undefined>) {
  const fps = ref<number | null>(null);
  let bound: HTMLVideoElement | null = null;
  let handle: number | null = null;
  let base: FrameSample | null = null;
  let previousRate: number | null = null;

  function stop() {
    if (handle !== null && bound) bound.cancelVideoFrameCallback(handle);
    handle = null;
    base = null;
    previousRate = null;
  }

  function onFrame(_now: number, metadata: VideoFrameCallbackMetadata) {
    const element = bound;
    if (!element) {
      handle = null;
      return;
    }
    if (base) {
      const span = metadata.mediaTime - base.mediaTime;
      const frames = metadata.presentedFrames - base.presentedFrames;
      if (span <= 0 || frames <= 0) {
        // A seek or a stall: the window restarts on the current frame.
        base = { mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames };
      } else if (span >= MIN_MEDIA_SPAN) {
        const rate = frames / span;
        if (rate >= MIN_RATE && rate <= MAX_RATE) {
          if (previousRate !== null && Math.abs(rate - previousRate) <= RATE_TOLERANCE * rate) {
            fps.value = rate;
            stop();
            return;
          }
          previousRate = rate;
        }
        base = { mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames };
      }
    } else {
      base = { mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames };
    }
    handle = element.requestVideoFrameCallback(onFrame);
  }

  function start() {
    const element = bound;
    // rvfc supports concurrent callbacks, so this measurement does not disturb
    // the playback anchor of useVideoTimestamp.
    if (!element || typeof element.requestVideoFrameCallback !== "function") return;
    if (handle !== null) return;
    handle = element.requestVideoFrameCallback(onFrame);
  }

  function bind(element: HTMLVideoElement | null | undefined) {
    stop();
    bound = element ?? null;
    fps.value = null;
    start();
  }

  watch(video, bind, { immediate: true, flush: "post" });

  onBeforeUnmount(stop);

  return { fps };
}
