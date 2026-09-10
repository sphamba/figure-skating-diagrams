import "@fontsource-variable/inter";
import "primeicons/primeicons.css";

import { createApp } from "vue";
import { createPinia } from "pinia";
import OpenVue from "openvue/config";
import ConfirmationService from "openvue/confirmationservice";
import Ripple from "openvue/ripple";
import Aura from "@openvue/themes/aura";
import { definePreset } from "@openuxkit/themes";

import App from "./App.vue";
import router from "./router";

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
app.use(router);
app.use(ConfirmationService);
app.directive("ripple", Ripple);
app.use(OpenVue, {
  theme: {
    preset: appPreset,
    options: {
      prefix: "p",
      darkModeSelector: "system",
      cssLayer: false,
    },
  },
});

app.mount("#app");
