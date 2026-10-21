import type { EasyDrawElement } from "./elements";

export const FONT_FAMILY = {
  Virgil: 1,
  Helvetica: 2,
  Cascadia: 3,
  // leave 4 unused as it was historically used for Assistant (which we don't use anymore) or custom font (Obsidian)
  Excalifont: 5,
  Nunito: 6,
  "Lilita One": 7,
  "Comic Shanns": 8,
  "Liberation Sans": 9,
};

export const THEME = {
  LIGHT: "light",
  DARK: "dark",
} as const;

export const TEXT_ALIGN = {
  LEFT: "left",
  CENTER: "center",
  RIGHT: "right",
};

export const VERTICAL_ALIGN = {
  TOP: "top",
  MIDDLE: "middle",
  BOTTOM: "bottom",
};

export const ROUNDNESS = {
  // Used for legacy rounding (rectangles), which currently works the same
  // as PROPORTIONAL_RADIUS, but we need to differentiate for UI purposes and
  // forwards-compat.
  LEGACY: 1,

  // Used for linear elements & diamonds
  PROPORTIONAL_RADIUS: 2,

  // Current default algorithm for rectangles, using fixed pixel radius.
  // It's working similarly to a regular border-radius, but attemps to make
  // radius visually similar across differnt element sizes, especially
  // very large and very small elements.
  //
  // NOTE right now we don't allow configuration and use a constant radius
  // (see DEFAULT_ADAPTIVE_RADIUS constant)
  ADAPTIVE_RADIUS: 3,
} as const;

export const DEFAULT_ELEMENT_PROPS: {
  strokeColor: EasyDrawElement["strokeColor"];
  backgroundColor: EasyDrawElement["backgroundColor"];
  fillStyle: EasyDrawElement["fillStyle"];
  strokeWidth: EasyDrawElement["strokeWidth"];
  strokeStyle: EasyDrawElement["strokeStyle"];
  roughness: EasyDrawElement["roughness"];
  opacity: EasyDrawElement["opacity"];
  locked: EasyDrawElement["locked"];
} = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  locked: false,
};
