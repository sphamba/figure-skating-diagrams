<script setup lang="ts">
import Tag from "openvue/tag";
import type { HelpItem } from "@/components/DiagramSidebar.vue";

defineProps<{ helpItems: HelpItem[] }>();

// The icon is picked per key tag: mouse gestures, finger gestures, otherwise a keyboard key.
// The UI button tags "+" and "−" show no icon; the cog tag shows only a cog icon.
function iconOf(key: string): "mouse" | "finger" | "twoFinger" | "keyboard" | "cog" | "none" {
  const lower = key.toLowerCase();
  if (lower.includes("two fingers")) return "twoFinger";
  if (lower.includes("finger")) return "finger";
  if (lower.includes("wheel") || lower.includes("click") || lower.includes("drag")) return "mouse";
  if (lower === "cog") return "cog";
  if (lower === "+" || lower === "−") return "none";
  return "keyboard";
}
</script>

<template>
  <ul class="diagram-sidebar__hint">
    <li
      v-for="(item, index) in helpItems"
      :key="`${index}-${item.descriptions.join('|')}`"
      class="diagram-sidebar__hint-item"
    >
      <span class="diagram-sidebar__hint-keys">
        <template v-for="(key, keyIndex) in item.keys" :key="key">
          <Tag
            :class="iconOf(key) === 'cog' ? 'diagram-sidebar__hint-cog-tag' : undefined"
            :value="iconOf(key) === 'cog' ? undefined : key"
            rounded
          >
            <template v-if="iconOf(key) !== 'none'" #icon>
              <svg
                v-if="iconOf(key) === 'mouse'"
                class="diagram-sidebar__hint-icon"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  fill-rule="evenodd"
                  d="M5 7.5C5 4.6 7 2.5 10 2.5c3 0 5 2.1 5 5v5c0 2.9-2 5-5 5s-5-2.1-5-5Zm4.2-2.9v3h1.6v-3Z"
                />
              </svg>
              <svg
                v-else-if="iconOf(key) === 'finger'"
                class="diagram-sidebar__hint-icon"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M8.6 4.4c0-.8.6-1.4 1.4-1.4s1.4.6 1.4 1.4v8H8.6Zm-3.7 10.9c0-2 1.6-3.1 3.6-3.1h3c2 0 3.6 1.1 3.6 3.1Z"
                />
              </svg>
              <svg
                v-else-if="iconOf(key) === 'twoFinger'"
                class="diagram-sidebar__hint-icon"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M6.2 4.4c0-.8.6-1.4 1.4-1.4S9 3.6 9 4.4v8H6.2Zm4.8 0c0-.8.6-1.4 1.4-1.4s1.4.6 1.4 1.4v8H11Zm-8.3 10.9c0-2 1.6-3.1 3.6-3.1h7.4c2 0 3.6 1.1 3.6 3.1Z"
                />
              </svg>
              <svg
                v-else-if="iconOf(key) === 'cog'"
                class="diagram-sidebar__hint-icon"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  fill-rule="evenodd"
                  d="M10 12.7C11.49 12.7 12.7 11.49 12.7 10 12.7 8.51 11.49 7.3 10 7.3 8.51 7.3 7.3 8.51 7.3 10 7.3 11.49 8.51 12.7 10 12.7ZM15.65 8.70 L17.81 8.83 L17.81 11.17 L15.65 11.30 L14.92 13.07 L16.35 14.70 L14.70 16.35 L13.07 14.92 L11.30 15.65 L11.17 17.81 L8.83 17.81 L8.70 15.65 L6.93 14.92 L5.30 16.35 L3.65 14.70 L5.08 13.07 L4.35 11.30 L2.19 11.17 L2.19 8.83 L4.35 8.70 L5.08 6.93 L3.65 5.30 L5.30 3.65 L6.93 5.08 L8.70 4.35 L8.83 2.19 L11.17 2.19 L11.30 4.35 L13.07 5.08 L14.70 3.65 L16.35 5.30 L14.92 6.93Z"
                />
              </svg>
              <svg v-else class="diagram-sidebar__hint-icon" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  fill="currentColor"
                  fill-rule="evenodd"
                  d="M4.5 5h11A1.75 1.75 0 0 1 17.25 6.75v6.5A1.75 1.75 0 0 1 15.5 15h-11A1.75 1.75 0 0 1 2.75 13.25v-6.5A1.75 1.75 0 0 1 4.5 5Zm1.3 3a.85.85 0 1 0 1.7 0 .85.85 0 0 0-1.7 0Zm3.2 0a.85.85 0 1 0 1.7 0 .85.85 0 0 0-1.7 0Zm3.2 0a.85.85 0 1 0 1.7 0 .85.85 0 0 0-1.7 0Zm-5.9 2.9a.85.85 0 1 0 1.7 0 .85.85 0 0 0-1.7 0Zm3.2 0a.85.85 0 1 0 1.7 0 .85.85 0 0 0-1.7 0Zm3.2 0a.85.85 0 1 0 1.7 0 .85.85 0 0 0-1.7 0Zm-5.9 1.55v1h6.4v-1Z"
                />
              </svg>
            </template>
            <span v-if="iconOf(key) !== 'cog'" class="diagram-sidebar__hint-label">{{ key }}</span>
          </Tag>
          <span v-if="keyIndex < item.keys.length - 1" class="diagram-sidebar__hint-separator">+</span>
        </template>
      </span>
      <span class="diagram-sidebar__hint-descs">
        <span v-for="description in item.descriptions" :key="description" class="diagram-sidebar__hint-desc">
          {{ description }}
        </span>
      </span>
    </li>
  </ul>
</template>

<style scoped lang="scss">
.diagram-sidebar__hint {
  margin: 0;
  padding: 0;
  list-style: none;
}

.diagram-sidebar__hint-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.diagram-sidebar__hint-keys {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

/* Give the icon and the text a clearer gap inside the hint tags. The cog tag
   is icon-only and keeps its own zero-gap rule. */
.diagram-sidebar__hint-keys :deep(.p-tag) {
  gap: 0.375rem;
}

/* The openvue Tag keeps a 4px gap before its empty label span, which shows as
   a space to the right of the icon-only cog tag. */
.diagram-sidebar__hint-keys :deep(.p-tag.diagram-sidebar__hint-cog-tag) {
  gap: 0;
}

.diagram-sidebar__hint-keys :deep(.p-tag.diagram-sidebar__hint-cog-tag .p-tag-label) {
  display: none;
}

.diagram-sidebar__hint-separator {
  display: flex;
  align-items: center;
  color: var(--p-text-muted-color);
}

.diagram-sidebar__hint-icon {
  display: block;
  width: 0.875rem;
  height: 0.875rem;
}

.diagram-sidebar__hint-label {
  color: inherit;
}

.diagram-sidebar__hint-descs {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  color: var(--p-text-muted-color);
}
</style>
