import { createRouter, createWebHashHistory } from "vue-router";
import MainLayout from "@/layouts/MainLayout.vue";

// The home page reads the previous path to keep an empty diagram empty when
// the user navigates back from the editor.
let previousPath = "/";

export function getPreviousPath(): string {
  return previousPath;
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      component: MainLayout,
      children: [
        {
          path: "",
          name: "home",
          component: () => import("@/views/HomeView.vue"),
          meta: { fullBleed: true },
        },
        {
          path: "editor",
          name: "editor",
          component: () => import("@/views/EditorView.vue"),
          meta: { fullBleed: true },
        },
        {
          path: "about",
          name: "about",
          component: () => import("@/views/AboutView.vue"),
        },
      ],
    },
  ],
});

// A fresh page load starts at "/": only SPA navigation reports a previous path.
router.beforeEach((to, from) => {
  previousPath = from.path;
});

export default router;
