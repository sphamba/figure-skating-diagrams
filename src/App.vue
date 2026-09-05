<script setup lang="ts">
// Root component. Routes render inside MainLayout (see src/router/index.ts).
</script>

<template>
  <router-view />
</template>

<style>
/* Global base styles. OpenVue components inherit the font from the application. */
:root,
html,
body {
  font-family: "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

html,
body {
  margin: 0;
  min-height: 100%;
}
</style>
