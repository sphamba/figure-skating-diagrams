<script setup lang="ts">
defineProps<{ canUndo: boolean; canRedo: boolean }>();
defineEmits<{ undo: []; redo: [] }>();
</script>

<template>
  <div class="undo-redo-buttons">
    <button
      type="button"
      class="undo-redo-buttons__button"
      :disabled="!canUndo"
      :aria-label="$t('undoRedo.undo')"
      @click="$emit('undo')"
    >
      <svg
        class="undo-redo-buttons__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.31"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
      </svg>
    </button>
    <button
      type="button"
      class="undo-redo-buttons__button"
      :disabled="!canRedo"
      :aria-label="$t('undoRedo.redo')"
      @click="$emit('redo')"
    >
      <svg
        class="undo-redo-buttons__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.31"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M15 14l5-5-5-5" />
        <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.undo-redo-buttons {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  z-index: 6;
  display: flex;
  gap: 0.5rem;
}

.undo-redo-buttons__button {
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

.undo-redo-buttons__button:disabled {
  opacity: 0.4;
  cursor: default;
}

/* The icon renders at 65% of the button circle, so the stroke width scales
   up by 1/0.65 to keep the effective line width. */
.undo-redo-buttons__icon {
  width: 1.3rem;
  height: 1.3rem;
  display: block;
}
</style>
