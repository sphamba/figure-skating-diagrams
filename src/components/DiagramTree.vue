<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import Button from "openvue/button";
import ConfirmDialog from "openvue/confirmdialog";
import Dialog from "openvue/dialog";
import Tree from "openvue/tree";
import { useConfirm } from "openvue/useconfirm";
import { useI18n } from "vue-i18n";
import diagramTree from "virtual:diagram-tree";
import { buildLibraryTree, deleteSavedDiagram, listSavedDiagrams } from "@/utils/diagramLibrary";
import type { LibraryTreeNode } from "@/utils/diagramLibrary";
import type { TreeNode } from "openvue/treenode";

export type DiagramTreeSource = { source: "bundled"; path: string } | { source: "saved"; name: string };

const props = defineProps<{ visible: boolean; refreshKey: number }>();

const emit = defineEmits<{
  select: [source: DiagramTreeSource];
  "open-request": [];
  "update:visible": [visible: boolean];
}>();

const { t } = useI18n();
const confirm = useConfirm();

const savedNames = ref<string[]>([]);
const selectionKeys = ref<Record<string, boolean>>({});
const expandedKeys = ref<Record<string, boolean>>({ saved: true });

const libraryNodes = computed(() =>
  buildLibraryTree(savedNames.value, diagramTree, t("files.savedFolder"), t("files.savedEmpty")),
);

async function refreshSaved() {
  savedNames.value = await listSavedDiagrams();
  selectionKeys.value = {};
}

onMounted(() => void refreshSaved());

// The parent owns the unsaved guard and the save triggers, so the saved list
// reloads whenever the dialog opens or the parent bumps the refresh key.
watch(
  () => [props.visible, props.refreshKey] as const,
  ([visible]) => {
    if (visible) void refreshSaved();
  },
);

function closeLibrary() {
  emit("update:visible", false);
}

function onNodeSelect(node: TreeNode) {
  // Clear the selection so clicking the same leaf again selects it.
  selectionKeys.value = {};
  const libraryNode = node as LibraryTreeNode;
  if (libraryNode.children?.length) {
    expandedKeys.value = { ...expandedKeys.value, [libraryNode.key]: !expandedKeys.value[libraryNode.key] };
    return;
  }
  if (libraryNode.type === "saved") {
    emit("select", { source: "saved", name: libraryNode.label });
    closeLibrary();
    return;
  }
  if (libraryNode.path) {
    emit("select", { source: "bundled", path: libraryNode.path });
    closeLibrary();
  }
}

function onNodeUnselect(node: TreeNode) {
  // A second row click on a selected folder arrives as an unselect; toggle it too.
  const libraryNode = node as LibraryTreeNode;
  if (libraryNode.children?.length) {
    expandedKeys.value = { ...expandedKeys.value, [libraryNode.key]: !expandedKeys.value[libraryNode.key] };
  }
}

function requestDelete(name: string) {
  confirm.require({
    group: "diagram-tree-delete",
    header: t("files.confirm.deleteHeader"),
    message: t("files.confirm.deleteMessage", { name }),
    icon: "pi pi-exclamation-triangle",
    rejectLabel: t("files.confirm.cancel"),
    acceptLabel: t("files.confirm.delete"),
    acceptProps: { severity: "danger" },
    rejectProps: { severity: "secondary", text: true },
    accept: () => void deleteConfirmed(name),
  });
}

async function deleteConfirmed(name: string) {
  await deleteSavedDiagram(name);
  await refreshSaved();
}
</script>

<template>
  <div class="diagram-tree">
    <Button
      :label="$t('files.load')"
      icon="pi pi-folder-open"
      class="w-full"
      severity="secondary"
      @click="$emit('open-request')"
    />
    <Dialog
      :visible="visible"
      modal
      :header="t('files.libraryTitle')"
      class="diagram-tree__dialog"
      @update:visible="$emit('update:visible', $event)"
    >
      <Tree
        v-model:selection-keys="selectionKeys"
        v-model:expanded-keys="expandedKeys"
        :value="libraryNodes"
        selection-mode="single"
        scroll-height="40vh"
        class="diagram-tree__library"
        @node-select="onNodeSelect"
        @node-unselect="onNodeUnselect"
      >
        <template #default="{ node, expanded }">
          <i
            class="diagram-tree__node-icon"
            :class="node.children?.length ? (expanded ? 'pi pi-folder-open' : 'pi pi-folder') : 'pi pi-file'"
          />
          <span class="diagram-tree__node-label">{{ node.label }}</span>
        </template>
        <template #placeholder="{ node }">
          <span class="diagram-tree__node-label diagram-tree__empty">{{ node.label }}</span>
        </template>
        <template #saved="{ node }">
          <i class="pi pi-file diagram-tree__node-icon" />
          <span class="diagram-tree__node-label">{{ node.label }}</span>
          <Button
            icon="pi pi-trash"
            severity="danger"
            text
            class="diagram-tree__delete"
            :aria-label="$t('files.confirm.deleteNamed', { name: String(node.label) })"
            @click.stop="requestDelete(String(node.label))"
          />
        </template>
      </Tree>
    </Dialog>
    <ConfirmDialog group="diagram-tree-delete" />
  </div>
</template>

<style scoped lang="scss">
.diagram-tree {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.diagram-tree__library {
  padding: 0.25rem;
  font-size: 0.875rem;
  background: transparent;
}

.diagram-tree__node-icon {
  padding-right: 0.25rem;
}

.diagram-tree__empty {
  color: var(--p-text-muted-color);
}
</style>

<!-- The Dialog teleports to the body without the scoped attribute, so these rules must be global. -->
<style lang="scss">
.diagram-tree__dialog {
  width: 500px;
  max-width: calc(100vw - 2rem);
}

.diagram-tree__dialog .p-dialog-content {
  padding: 0;
}

.diagram-tree__dialog .p-tree-node-label {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 0.25rem;
}

.diagram-tree__dialog .p-tree-node-icon:empty {
  display: none;
}
</style>
