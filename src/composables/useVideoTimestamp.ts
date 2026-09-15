import { onBeforeUnmount, ref, watch, type Ref } from "vue";

type TimeExtent = [number, number];

type TimestampOptions = {
  speed?: Ref<number>;
  extent?: () => TimeExtent | null;
};

type Anchor = { time: number; wall: number };

// Live video timestamp. While playing, the rAF loop interpolates the last
// presented frame by the playback rate; without a video the play state runs a
// virtual loop that advances the timestamp inside the extent.
export function useVideoTimestamp(video: Ref<HTMLVideoElement | null | undefined>, options?: TimestampOptions) {
  const seconds = ref(0);
  const playing = ref(false);
  const speed = options?.speed;
  const extent = options?.extent;
  let frameHandle: number | null = null;
  let rvfcHandle: number | null = null;
  let bound: HTMLVideoElement | null = null;
  let anchor: Anchor = { time: 0, wall: 0 };
  let seeking = false;
  let lastFrame: number | null = null;
  // Seconds of the last user-driven seek, while the video still catches up.
  let pendingTarget: number | null = null;

  function stopLoop() {
    if (frameHandle !== null) {
      cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }
  }

  function stopRvfc() {
    if (rvfcHandle !== null && bound) {
      bound.cancelVideoFrameCallback(rvfcHandle);
      rvfcHandle = null;
    }
  }

  function hasRvfc(): boolean {
    return typeof bound?.requestVideoFrameCallback === "function";
  }

  // The only path allowed to move the timestamp backward (seek and pause).
  function anchorFromElement() {
    const element = video.value;
    if (!element) return;
    // The video processes queued seeks one by one and fires events for each, so a
    // completed seek may still report an older position. Adopting it would replay
    // earlier drag positions and flash the timelines; wait for the last target.
    if (pendingTarget !== null && Math.abs(element.currentTime - pendingTarget) > 0.05) return;
    pendingTarget = null;
    anchor = { time: element.currentTime, wall: performance.now() };
    seconds.value = element.currentTime;
  }

  // Pure interpolation of the anchor frame by the playback rate; the timestamp
  // never moves backward while playing.
  function loop(now: number) {
    if (!playing.value || (bound && bound.paused)) {
      frameHandle = null;
      return;
    }
    if (seeking) {
      // Hold at the seek target; the frames to extrapolate from are not presented yet.
      frameHandle = requestAnimationFrame(loop);
      return;
    }
    const rate = speed?.value ?? bound?.playbackRate ?? 1;
    const estimate = anchor.time + ((now - anchor.wall) / 1000) * rate;
    seconds.value = Math.max(estimate, seconds.value);
    frameHandle = requestAnimationFrame(loop);
  }

  // During a seek the video still shows pre-seek frames, so the anchor is not
  // rotated then.
  function onVideoFrame(_now: number, metadata: VideoFrameCallbackMetadata) {
    const element = bound;
    if (!element || element.paused) {
      rvfcHandle = null;
      return;
    }
    if (!seeking) anchor = { time: metadata.mediaTime, wall: metadata.expectedDisplayTime };
    rvfcHandle = element.requestVideoFrameCallback(onVideoFrame);
  }

  function startRvfc() {
    const element = bound;
    if (!element || typeof element.requestVideoFrameCallback !== "function") return;
    if (rvfcHandle !== null) return;
    rvfcHandle = element.requestVideoFrameCallback(onVideoFrame);
  }

  function virtualLoop(ts: number) {
    if (!playing.value) return;
    if (lastFrame !== null) {
      const bounds = extent?.();
      if (!bounds) {
        playing.value = false;
        lastFrame = null;
        return;
      }
      const [lo, hi] = bounds;
      seconds.value += ((ts - lastFrame) / 1000) * (speed?.value ?? 1);
      if (seconds.value > hi) seconds.value = lo + ((seconds.value - lo) % (hi - lo));
    }
    lastFrame = ts;
    frameHandle = requestAnimationFrame(virtualLoop);
  }

  function onPlay() {
    // Playing supersedes the seek target: the video advances past it.
    pendingTarget = null;
    stopLoop();
    stopRvfc();
    playing.value = true;
    anchorFromElement();
    startRvfc();
    loop(performance.now());
  }

  function onPauseOrEnd() {
    stopLoop();
    stopRvfc();
    seeking = false;
    playing.value = false;
    anchorFromElement();
  }

  function onSeeking() {
    seeking = true;
    anchorFromElement();
  }

  function onSeeked() {
    seeking = false;
    anchorFromElement();
  }

  function onTimeUpdate() {
    const element = video.value;
    if (!element) return;
    if (element.paused) {
      anchorFromElement();
    } else if (!hasRvfc()) {
      anchorFromElement();
    }
  }

  function play() {
    const element = video.value;
    if (element) {
      void element.play();
      return;
    }
    if (playing.value) return;
    const bounds = extent?.();
    if (!bounds) return;
    const [lo, hi] = bounds;
    if (seconds.value < lo || seconds.value > hi) seconds.value = lo;
    stopLoop();
    lastFrame = null;
    playing.value = true;
    frameHandle = requestAnimationFrame(virtualLoop);
  }

  function pause() {
    const element = video.value;
    if (element) {
      element.pause();
      return;
    }
    stopLoop();
    playing.value = false;
    lastFrame = null;
  }

  function setTimestamp(value: number) {
    const element = video.value;
    if (!element) {
      seconds.value = value;
      return;
    }
    const clamped = Math.max(0, Math.min(value, element.duration || value));
    pendingTarget = clamped;
    element.currentTime = clamped;
    seconds.value = clamped;
    anchor = { time: clamped, wall: performance.now() };
    seeking = true;
  }

  function bind(element: HTMLVideoElement | null | undefined) {
    if (bound) {
      bound.removeEventListener("play", onPlay);
      bound.removeEventListener("playing", onPlay);
      bound.removeEventListener("pause", onPauseOrEnd);
      bound.removeEventListener("ended", onPauseOrEnd);
      bound.removeEventListener("seeking", onSeeking);
      bound.removeEventListener("seeked", onSeeked);
      bound.removeEventListener("timeupdate", onTimeUpdate);
    }
    bound = element ?? null;
    stopLoop();
    stopRvfc();
    playing.value = false;
    pendingTarget = null;
    seconds.value = 0;
    anchor = { time: 0, wall: 0 };
    if (!element) return;
    element.addEventListener("play", onPlay);
    element.addEventListener("playing", onPlay);
    element.addEventListener("pause", onPauseOrEnd);
    element.addEventListener("ended", onPauseOrEnd);
    element.addEventListener("seeking", onSeeking);
    element.addEventListener("seeked", onSeeked);
    element.addEventListener("timeupdate", onTimeUpdate);
    if (!element.paused) {
      playing.value = true;
      startRvfc();
      loop(performance.now());
    }
  }

  watch(video, bind, { immediate: true, flush: "post" });

  onBeforeUnmount(stopLoop);

  return { seconds, playing, play, pause, setTimestamp };
}
