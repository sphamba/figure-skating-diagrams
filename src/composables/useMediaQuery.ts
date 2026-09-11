import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  let list: MediaQueryList | null = null;

  function update(event: MediaQueryListEvent) {
    matches.value = event.matches;
  }

  onMounted(() => {
    list = window.matchMedia(query);
    matches.value = list.matches;
    list.addEventListener("change", update);
  });

  onBeforeUnmount(() => list?.removeEventListener("change", update));

  return matches;
}
