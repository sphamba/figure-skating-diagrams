import { onBeforeUnmount, ref, watch, type Ref } from "vue";

type TimeExtent = [number, number];

type TimestampOptions = {
  speed?: Ref<number>;
  extent?: () => TimeExtent | null;
};

// Live video timestamp: rAF while playing, element events otherwise.
// Without a video the play state runs a virtual loop that advances the timestamp.
export function useVideoTimestamp(video: Ref<HTMLVideoElement | null | undefined>, options?: TimestampOptions) {
  const seconds = ref(0);
  const playing = ref(false);
  const speed = options?.speed;
  const extent = options?.extent;
  let frameHandle: number | null = null;
  let bound: HTMLVideoElement | null = null;
  let lastFrame: number | null = null;

  function stopLoop() {
    if (frameHandle !== null) {
      cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }
  }

  function readTime() {
    const element = video.value;
    if (element) seconds.value = element.currentTime;
  }

  function loop() {
    readTime();
    frameHandle = requestAnimationFrame(loop);
  }

  // Advance the timestamp in real time scaled by the playback speed; loop inside the extent.
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
    stopLoop();
    playing.value = true;
    loop();
  }

  function onPauseOrEnd() {
    stopLoop();
    playing.value = false;
    readTime();
  }

  function onTimeUpdate() {
    if (video.value?.paused) readTime();
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
    element.currentTime = clamped;
    seconds.value = clamped;
  }

  function bind(element: HTMLVideoElement | null | undefined) {
    if (bound) {
      bound.removeEventListener("play", onPlay);
      bound.removeEventListener("playing", onPlay);
      bound.removeEventListener("pause", onPauseOrEnd);
      bound.removeEventListener("ended", onPauseOrEnd);
      bound.removeEventListener("seeked", readTime);
      bound.removeEventListener("timeupdate", onTimeUpdate);
    }
    bound = element ?? null;
    stopLoop();
    playing.value = false;
    seconds.value = 0;
    if (!element) return;
    element.addEventListener("play", onPlay);
    element.addEventListener("playing", onPlay);
    element.addEventListener("pause", onPauseOrEnd);
    element.addEventListener("ended", onPauseOrEnd);
    element.addEventListener("seeked", readTime);
    element.addEventListener("timeupdate", onTimeUpdate);
    if (!element.paused) loop();
  }

  watch(video, bind, { immediate: true, flush: "post" });

  onBeforeUnmount(stopLoop);

  return { seconds, playing, play, pause, setTimestamp };
}
