<script setup lang="ts">
defineProps<{ active: boolean; mode?: "barycenter" | "cursor" }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    type="button"
    class="tracking-button"
    :class="{ 'tracking-button--active': active }"
    :aria-pressed="active"
    :aria-label="active ? 'Stop tracking the time cursor' : 'Center the view on the time cursor'"
    @click="$emit('toggle')"
  >
    <svg
      v-if="active && mode === 'cursor'"
      class="tracking-button__icon"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polygon points="12,4.9 16.3,17.2 12,15.2 7.7,17.2" />
    </svg>
    <svg
      v-else
      class="tracking-button__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="3.5" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="20.5" />
      <line x1="3.5" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="20.5" y2="12" />
    </svg>
  </button>
</template>

<style scoped>
.tracking-button {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  z-index: 6;
  width: 2.5rem;
  height: 2.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--p-content-border-color);
  border-radius: 50%;
  background: var(--p-content-background);
  color: var(--p-text-muted-color, #808080);
  cursor: pointer;
  padding: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.tracking-button--active {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}

.tracking-button__icon {
  width: 2rem;
  height: 2rem;
  display: block;
}
</style>
