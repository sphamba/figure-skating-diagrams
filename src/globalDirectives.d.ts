import type Tooltip from "openvue/tooltip";

declare module "@vue/runtime-core" {
  interface GlobalDirectives {
    VTooltip: typeof Tooltip;
  }
}
