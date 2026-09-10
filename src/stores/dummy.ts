import { computed, ref } from "vue";
import { defineStore } from "pinia";

export const useDummyStore = defineStore("dummy", () => {
  const count = ref(0);
  const label = ref("dummy-store");

  const countLabel = computed(() => `${label.value}: ${count.value}`);

  function increment() {
    count.value += 1;
  }

  function reset() {
    count.value = 0;
  }

  return { count, label, countLabel, increment, reset };
});
