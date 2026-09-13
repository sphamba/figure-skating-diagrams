import { ref, watch, type Ref } from "vue";

// Playback speed selection shared by the video panels.
export function usePlaybackSpeed(video: Ref<HTMLVideoElement | null | undefined>) {
  const speed = ref(1);
  const options = [
    { label: "×0.25", value: 0.25 },
    { label: "×0.5", value: 0.5 },
    { label: "×1", value: 1 },
  ];

  watch(speed, (value) => {
    if (video.value) video.value.playbackRate = value;
  });

  function apply() {
    if (video.value) video.value.playbackRate = speed.value;
  }

  function reset() {
    speed.value = 1;
  }

  return { speed, options, apply, reset };
}
