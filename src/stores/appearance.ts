import { ref, watch } from "vue";
import { defineStore } from "pinia";

const STORAGE_KEY = "appearance";

const systemDark =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

interface StoredAppearance {
  darkModeOverridden?: boolean;
  darkMode?: boolean;
  showLabels?: boolean;
  showLegend?: boolean;
  scaleElements?: boolean;
}

function loadStoredAppearance(): StoredAppearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredAppearance;
  } catch (error) {
    console.error("Could not read the stored appearance settings:", error);
    localStorage.removeItem(STORAGE_KEY);
  }
  return {};
}

export const useAppearanceStore = defineStore("appearance", () => {
  const stored = loadStoredAppearance();
  const darkMode = ref(
    stored.darkModeOverridden === true && typeof stored.darkMode === "boolean"
      ? stored.darkMode
      : (systemDark?.matches ?? false),
  );
  const overridden = ref(stored.darkModeOverridden === true);
  const showLabels = ref(stored.showLabels === false ? false : true);
  const showLegend = ref(stored.showLegend === false ? false : true);
  const scaleElements = ref(stored.scaleElements === false ? false : true);
  let syncingFromSystem = false;

  function saveToStorage() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          darkModeOverridden: overridden.value,
          darkMode: darkMode.value,
          showLabels: showLabels.value,
          showLegend: showLegend.value,
          scaleElements: scaleElements.value,
        }),
      );
    } catch (error) {
      console.error("Could not store the appearance settings:", error);
    }
  }

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
      saveToStorage();
    },
    { flush: "sync" },
  );

  watch([showLabels, showLegend, scaleElements], saveToStorage);

  document.documentElement.classList.toggle("app-dark", darkMode.value);

  return { darkMode, showLabels, showLegend, scaleElements };
});
