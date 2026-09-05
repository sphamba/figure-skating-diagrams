import "@fontsource-variable/inter";
import "primeicons/primeicons.css";

import { createApp } from "vue";
import { createPinia } from "pinia";
import OpenVue from "openvue/config";
import Ripple from "openvue/ripple";
import Aura from "@openvue/themes/aura";

import App from "./App.vue";
import router from "./router";

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.directive("ripple", Ripple);
app.use(OpenVue, {
  theme: {
    preset: Aura,
    options: {
      prefix: "p",
      darkModeSelector: "system",
      cssLayer: false,
    },
  },
});

app.mount("#app");
