<script setup lang="ts">
import { onMounted } from "vue";
import { initCanvas } from "../engine/rinkCanvas";
import { test } from "../engine/testsRink.ts";

onMounted(() => {
  initCanvas();
  test();
});
</script>

<template>
  <div>
    <canvas id="diagram-canvas"></canvas>
    Hello from DiagramViewer!
  </div>
</template>

<style scoped></style>
