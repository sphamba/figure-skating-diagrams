<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import Button from "openvue/button";
import Menubar from "openvue/menubar";

const route = useRoute();
const isFullBleed = computed(() => Boolean(route.meta.fullBleed));

const items = ref([
  { label: "Home", icon: "pi pi-home", route: "/" },
  { label: "Editor", icon: "pi pi-pencil", route: "/editor" },
]);

const year = new Date().getFullYear();
</script>

<template>
  <div class="main-layout" :class="{ 'main-layout--full-bleed': isFullBleed }">
    <header class="main-layout__header">
      <Menubar :model="items">
        <template #start>
          <span class="main-layout__brand">Figure Skating Diagrams</span>
        </template>
        <template #item="{ item, props }">
          <router-link v-if="item.route" v-slot="{ href, navigate }" :to="item.route" custom>
            <a v-ripple :href="href" v-bind="props.action" @click="navigate">
              <span :class="item.icon" />
              <span>{{ item.label }}</span>
            </a>
          </router-link>
        </template>
        <template #end>
          <Button label="About" icon="pi pi-info-circle" text as-child v-slot="slotProps">
            <RouterLink to="/about" :class="slotProps.class" />
          </Button>
        </template>
      </Menubar>
    </header>

    <main class="main-layout__content" :class="{ 'main-layout__content--full-bleed': isFullBleed }">
      <router-view />
    </main>

    <footer v-if="!isFullBleed" class="main-layout__footer">
      <span>&copy; {{ year }} Son Pham-Ba</span>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.main-layout {
  display: flex;
  min-height: 100vh;
  flex-direction: column;

  &--full-bleed {
    height: 100vh;
    min-height: 0;
    overflow: hidden;
  }

  &__header {
    position: sticky;
    top: 0;
    z-index: 10;
  }

  &__content {
    flex: 1;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;

    &--full-bleed {
      display: flex;
      min-height: 0;
      max-width: none;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    border-top: 1px solid var(--p-content-border-color);
    color: var(--p-text-muted-color);
    font-size: 0.875rem;
  }
}
</style>
