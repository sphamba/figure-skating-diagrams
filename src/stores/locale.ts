import { ref, watch } from "vue";
import { defineStore } from "pinia";
import { i18n, detectLocale, persistLocale, type Locale } from "@/i18n";

function applyDocumentLocale(locale: Locale) {
  document.documentElement.lang = locale;
  document.title = i18n.global.t("app.title");
}

export const useLocaleStore = defineStore("locale", () => {
  const locale = ref<Locale>(detectLocale());

  function set(value: Locale) {
    locale.value = value;
  }

  // The i18n locale is a global computed: the app translates reactively after it changes.
  watch(
    locale,
    (value) => {
      i18n.global.locale.value = value;
      persistLocale(value);
      applyDocumentLocale(value);
    },
    { flush: "sync" },
  );

  i18n.global.locale.value = locale.value;
  applyDocumentLocale(locale.value);

  return { locale, set };
});
