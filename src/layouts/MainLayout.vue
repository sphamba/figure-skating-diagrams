<script setup lang="ts">
// Composition API: expose the current year for the footer.
const year = new Date().getFullYear();
</script>

<template>
  <div class="main-layout">
    <header class="main-layout__header">
      <div class="main-layout__brand">Figure Skating Diagrams</div>
      <nav class="main-layout__nav">
        <router-link to="/">Home</router-link>
      </nav>
    </header>

    <main class="main-layout__content">
      <!-- Child routes (e.g. HomeView) render here. -->
      <router-view />
    </main>

    <footer class="main-layout__footer">
      <span>&copy; {{ year }} Figure Skating Diagrams</span>
    </footer>
  </div>
</template>

<style scoped lang="scss">
// Make the design tokens available in this scoped style block.
@use "@/styles/theme" as *;

.main-layout {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  background-color: $color-bg;
  color: $color-text;
  font-family: $font-family-base;
  font-size: $font-size-base;
  line-height: $line-height-base;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $space-4;
    padding: $space-4 $space-6;
    background-color: $color-surface;
    border-bottom: 1px solid $color-border;
  }

  &__brand {
    font-size: $font-size-lg;
    font-weight: $font-weight-bold;
    color: $color-primary;
  }

  &__nav {
    a {
      color: $color-text-muted;
      text-decoration: none;

      &:hover {
        color: $color-primary;
      }
    }
  }

  &__content {
    flex: 1;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: $space-6;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: $space-4;
    background-color: $color-surface;
    border-top: 1px solid $color-border;
    color: $color-text-muted;
    font-size: $font-size-sm;
  }
}
</style>
