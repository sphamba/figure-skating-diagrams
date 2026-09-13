<script setup lang="ts">
import { computed, ref } from "vue";
import Select from "openvue/select";
import diagramTree from "virtual:diagram-tree";

export type DiagramTreeSource = { source: "bundled"; path: string };

const emit = defineEmits<{ select: [source: DiagramTreeSource] }>();

type TreeGroup = { label: string; items: { name: string; path: string }[] };

const bundledGroups = computed<TreeGroup[]>(() => {
  const groups: TreeGroup[] = [];
  const walk = (folder: typeof diagramTree, prefix: string) => {
    if (folder.files.length > 0) groups.push({ label: prefix, items: folder.files });
    for (const child of folder.folders) walk(child, prefix ? `${prefix} / ${child.name}` : child.name);
  };
  walk(diagramTree, "diagrams");
  return groups;
});

const selectedPath = ref<string | null>(null);

function onTreeSelect(value: unknown) {
  if (typeof value !== "string" || value === "") return;
  const source: DiagramTreeSource = { source: "bundled", path: value };
  selectedPath.value = null;
  emit("select", source);
}
</script>

<template>
  <div class="diagram-tree">
    <label class="diagram-tree__label" for="diagram-tree-input">Saved diagrams</label>
    <Select
      input-id="diagram-tree-input"
      :model-value="selectedPath"
      :options="bundledGroups"
      option-label="name"
      option-value="path"
      option-group-label="label"
      option-group-children="items"
      placeholder="Open a diagram"
      class="w-full"
      @update:model-value="onTreeSelect"
    />
  </div>
</template>

<style scoped lang="scss">
.diagram-tree {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.diagram-tree__label {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
}
</style>
