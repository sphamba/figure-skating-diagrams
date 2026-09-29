import { ref, watch } from "vue";
import { defineStore } from "pinia";

const systemDark =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

export const useAppearanceStore = defineStore("appearance", () => {
  const darkMode = ref(systemDark?.matches ?? false);
  const overridden = ref(false);
  let syncingFromSystem = false;

  systemDark?.addEventListener("change", (event) => {
    if (overridden.value) return;
    syncingFromSystem = true;
    darkMode.value = event.matches;
    syncingFromSystem = false;
  });

  watch(
    darkMode,
    (value) => {
      if (!syncingFromSystem) overridden.value = true;
      document.documentElement.classList.toggle("app-dark", value);
    },
    { flush: "sync" },
  );

  document.documentElement.classList.toggle("app-dark", darkMode.value);

  return { darkMode };
});
