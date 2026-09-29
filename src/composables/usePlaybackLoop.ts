import { computed, ref, watch, type Ref } from "vue";

export type LoopStage = "idle" | "armed" | "active";

// A-B loop controller. The wrap watch confines a running playback to the loop
// region; setTimestamp performs the forward-only restart at the loop start.
// A user scrub or seek outside the region clamps back to the closest loop end.
export function usePlaybackLoop(seconds: Ref<number>, playing: Ref<boolean>, setTimestamp: (value: number) => void) {
  const stage = ref<LoopStage>("idle");
  const pointA = ref(0);
  const pointB = ref(0);

  const bounds = computed<[number, number] | null>(() => {
    if (stage.value !== "active") return null;
    return [Math.min(pointA.value, pointB.value), Math.max(pointA.value, pointB.value)];
  });

  // The window the short draw range option renders: the loop bounds while
  // active, the span from A to the cursor while armed, nothing while idle.
  const drawWindow = computed<[number, number] | null>(() => {
    if (stage.value === "active") return bounds.value;
    if (stage.value === "armed") {
      const now = seconds.value;
      return [Math.min(pointA.value, now), Math.max(pointA.value, now)];
    }
    return null;
  });

  function toggle() {
    if (stage.value === "idle") {
      pointA.value = seconds.value;
      stage.value = "armed";
      return;
    }
    if (stage.value === "armed") {
      pointB.value = seconds.value;
      if (pointB.value === pointA.value) {
        stage.value = "idle";
        return;
      }
      stage.value = "active";
      return;
    }
    stage.value = "idle";
  }

  function reset() {
    stage.value = "idle";
  }

  watch(seconds, (value) => {
    const region = bounds.value;
    if (!region) return;
    if (playing.value) {
      if (value >= region[1]) setTimestamp(region[0]);
      else if (value < region[0]) setTimestamp(region[0]);
      return;
    }
    if (value < region[0]) setTimestamp(region[0]);
    else if (value > region[1]) setTimestamp(region[1]);
  });

  return { stage, bounds, drawWindow, toggle, reset };
}
