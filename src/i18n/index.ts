import { createI18n } from "vue-i18n";
import en from "./messages/en";
import fr from "./messages/fr";

export type Locale = "en" | "fr";
export const LOCALES: Locale[] = ["en", "fr"];

const STORAGE_KEY = "locale";

function isLocale(value: string): value is Locale {
  return value === "en" || value === "fr";
}

// The stored choice wins, then the browser languages in order, then English.
export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isLocale(stored)) return stored;
  } catch {
    // localStorage can be unavailable; the browser languages still apply.
  }
  const languages =
    typeof navigator !== "undefined" && navigator.languages?.length
      ? navigator.languages
      : typeof navigator !== "undefined"
        ? [navigator.language]
        : [];
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0] ?? "";
    if (isLocale(base)) return base;
  }
  return "en";
}

export function persistLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch (error) {
    console.error("Could not store the language:", error);
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: "en",
  messages: { en, fr },
});
