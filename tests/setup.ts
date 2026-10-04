import { config } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import ToastService from "openvue/toastservice";
import en from "@/i18n/messages/en";
import fr from "@/i18n/messages/fr";

// A fresh composer per test file, shared by every mount in the file, so the
// components under test resolve $t and useI18n like in the app. ToastService
// backs useToast() in the sidebar components.
config.global.plugins = [
  createI18n({ legacy: false, locale: "en", fallbackLocale: "en", messages: { en, fr } }),
  ToastService,
];
