import { ref, watch, type Ref } from "vue";

const STORAGE_KEY = "playback-speed";
const ALLOWED_SPEEDS = [0.25, 0.5, 1];

function loadStoredSpeed(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const value = Number(raw);
      if (ALLOWED_SPEEDS.includes(value)) return value;
    }
  } catch (error) {
    console.error("Could not read the stored playback speed:", error);
  }
  return 1;
}

// Playback speed selection shared by the video panels.
export function usePlaybackSpeed(video: Ref<HTMLVideoElement | null | undefined>) {
  const speed = ref(loadStoredSpeed());
  const options = [
    { label: "×0.25", value: 0.25 },
    { label: "×0.5", value: 0.5 },
    { label: "×1", value: 1 },
  ];

  watch(speed, (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch (error) {
      console.error("Could not store the playback speed:", error);
    }
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
