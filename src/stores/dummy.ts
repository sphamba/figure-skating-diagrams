import { computed, ref } from "vue";
import { defineStore } from "pinia";

// Dummy Pinia store written with the composition (setup) API.
// Swap the placeholder state and actions for real application logic later.
export const useDummyStore = defineStore("dummy", () => {
  // State (refs)
  const count = ref(0);
  const label = ref("dummy-store");

  // Getters (computed)
  const countLabel = computed(() => `${label.value}: ${count.value}`);

  // Actions (plain functions mutating state)
  function increment() {
    count.value += 1;
  }

  function reset() {
    count.value = 0;
  }

  return { count, label, countLabel, increment, reset };
});
