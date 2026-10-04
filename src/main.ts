import "@fontsource-variable/inter";
import "primeicons/primeicons.css";

import { createApp } from "vue";
import { createPinia } from "pinia";
import OpenVue from "openvue/config";
import ConfirmationService from "openvue/confirmationservice";
import ToastService from "openvue/toastservice";
import Tooltip from "openvue/tooltip";
import Ripple from "openvue/ripple";
import Aura from "@openvue/themes/aura";
import { definePreset } from "@openuxkit/themes";

import App from "./App.vue";
import router from "./router";
import { i18n } from "./i18n";
import { useAppearanceStore } from "./stores/appearance";
import { useInputModeStore } from "./stores/inputMode";
import { useLocaleStore } from "./stores/locale";

const appPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: "{sky.50}",
      100: "{sky.100}",
      200: "{sky.200}",
      300: "{sky.300}",
      400: "{sky.400}",
      500: "{sky.500}",
      600: "{sky.600}",
      700: "{sky.700}",
      800: "{sky.800}",
      900: "{sky.900}",
      950: "{sky.950}",
    },
  },
});

const app = createApp(App);

app.use(createPinia());
useAppearanceStore();
useInputModeStore();
useLocaleStore();
app.use(i18n);
app.use(router);
app.use(ConfirmationService);
app.use(ToastService);
app.directive("ripple", Ripple);
app.directive("tooltip", Tooltip);
app.use(OpenVue, {
  theme: {
    preset: appPreset,
    options: {
      prefix: "p",
      darkModeSelector: ".app-dark",
      cssLayer: false,
    },
  },
});

app.mount("#app");
