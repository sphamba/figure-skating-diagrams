<script setup lang="ts">
import { onMounted } from "vue";
import { Pattern } from "../engine/pattern";
import { ctx, initCanvas } from "../engine/rinkCanvas";

onMounted(async () => {
  initCanvas();
  const res = await fetch(`${import.meta.env.BASE_URL}test-pattern.json`);
  const pattern = Pattern.fromJSON(await res.json());
  for (const sequence of pattern.sequences) {
    sequence.draw(ctx);
  }
});
</script>

<template>
  <div>
    <canvas id="diagram-canvas"></canvas>
  </div>
</template>

<style scoped></style>
