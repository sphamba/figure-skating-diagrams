<script setup lang="ts">
import DiagramViewer from "@/components/DiagramViewer.vue";
</script>

<template>
  <section class="home-view">
    <DiagramViewer />
  </section>
</template>

<style scoped lang="scss">
@use "@/styles/theme" as *;

.home-view {
  min-height: $space-8 * 6;
}
</style>
