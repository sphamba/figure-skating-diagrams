<script setup lang="ts">
import Tag from "openvue/tag";

type HelpItem = { keys: string[]; description: string };

defineProps<{ helpItems: HelpItem[] }>();

// Device icons inside the tags: finger gestures, a mouse gesture, otherwise a keyboard key.
function iconOf(item: HelpItem): "mouse" | "finger" | "twoFinger" | "keyboard" {
  const keys = item.keys.join(" ").toLowerCase();
  if (keys.includes("two fingers")) return "twoFinger";
  if (keys.includes("finger")) return "finger";
  if (keys.includes("wheel") || keys.includes("click") || keys.includes("drag")) return "mouse";
  return "keyboard";
}
</script>

<template>
  <ul class="diagram-sidebar__hint">
    <li v-for="(item, index) in helpItems" :key="`${index}-${item.description}`" class="diagram-sidebar__hint-item">
      <span class="diagram-sidebar__hint-keys">
        <template v-for="(key, keyIndex) in item.keys" :key="key">
          <Tag :value="key" rounded>
            <template #icon>
              <svg
                v-if="iconOf(item) === 'mouse'"
                class="diagram-sidebar__hint-icon"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <rect
                  x="5.5"
                  y="2.75"
                  width="9"
                  height="14.5"
                  rx="4.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                />
                <line x1="10" y1="5" x2="10" y2="7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              </svg>
              <svg
                v-else-if="iconOf(item) === 'finger'"
                class="diagram-sidebar__hint-icon"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <rect
                  x="8.6"
                  y="3"
                  width="2.8"
                  height="9.5"
                  rx="1.4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                />
                <path
                  d="M7.5 12.5c-1.6 0-2.6 1-2.6 2.8"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
                <path
                  d="M12.5 12.5c1.6 0 2.6 1 2.6 2.8"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
                <line
                  x1="4.9"
                  y1="15.3"
                  x2="15.1"
                  y2="15.3"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
              </svg>
              <svg
                v-else-if="iconOf(item) === 'twoFinger'"
                class="diagram-sidebar__hint-icon"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <rect
                  x="6.2"
                  y="3"
                  width="2.8"
                  height="9.5"
                  rx="1.4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                />
                <rect
                  x="11"
                  y="3"
                  width="2.8"
                  height="9.5"
                  rx="1.4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                />
                <path
                  d="M4.6 12.5c-1 0-1.9 1-1.9 2.8"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
                <path
                  d="M15.4 12.5c1 0 1.9 1 1.9 2.8"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
                <line
                  x1="2.7"
                  y1="15.3"
                  x2="17.3"
                  y2="15.3"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
              </svg>
              <svg v-else class="diagram-sidebar__hint-icon" viewBox="0 0 20 20" aria-hidden="true">
                <rect
                  x="2.75"
                  y="5"
                  width="14.5"
                  height="10"
                  rx="1.75"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                />
                <circle cx="6" cy="8" r="0.7" fill="currentColor" />
                <circle cx="9" cy="8" r="0.7" fill="currentColor" />
                <circle cx="12" cy="8" r="0.7" fill="currentColor" />
                <circle cx="6.5" cy="11" r="0.7" fill="currentColor" />
                <circle cx="9.5" cy="11" r="0.7" fill="currentColor" />
                <circle cx="12.5" cy="11" r="0.7" fill="currentColor" />
                <line
                  x1="7"
                  y1="13.2"
                  x2="13"
                  y2="13.2"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linecap="round"
                />
              </svg>
            </template>
            <span class="diagram-sidebar__hint-label">{{ key }}</span>
          </Tag>
          <span v-if="keyIndex < item.keys.length - 1" class="diagram-sidebar__hint-separator">+</span>
        </template>
      </span>
      <span class="diagram-sidebar__hint-desc">{{ item.description }}</span>
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
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.diagram-sidebar__hint-keys {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
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

.diagram-sidebar__hint-desc {
  color: var(--p-text-muted-color);
}
</style>
