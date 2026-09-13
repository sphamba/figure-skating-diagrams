import { onBeforeUnmount, ref, watch, type Ref } from "vue";

// Live video timestamp: rAF while playing, element events otherwise.
export function useVideoTimestamp(video: Ref<HTMLVideoElement | null | undefined>) {
  const seconds = ref(0);
  let frameHandle: number | null = null;
  let bound: HTMLVideoElement | null = null;

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

  function onPlay() {
    stopLoop();
    loop();
  }

  function onPauseOrEnd() {
    stopLoop();
    readTime();
  }

  function onTimeUpdate() {
    if (video.value?.paused) readTime();
  }

  function setTimestamp(value: number) {
    const element = video.value;
    if (!element) return;
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

  return { seconds, setTimestamp };
}
