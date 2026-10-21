import type { EasyDrawElement } from "./elements";
import { NativeElementSchema } from "./schema";
import { DEFAULT_ELEMENT_PROPS } from "./style";

/** Native command input. Text layout must supply its intended width/height. */
export type NativeElementInput = {
  id: string;
  type: EasyDrawElement["type"];
  x: number;
  y: number;
  width: number;
  height: number;
} & Record<string, unknown>;

/** Complete one new element, without browser state or a second scene format. */
export function createNativeElement(input: NativeElementInput): EasyDrawElement {
  let seed = 0;
  for (let i = 0; i < input.id.length; i++) seed = (Math.imul(seed, 31) + input.id.charCodeAt(i)) | 0;
  const defaults: Record<string, unknown> = {
    ...DEFAULT_ELEMENT_PROPS,
    angle: 0, seed: seed >>> 0, version: 1, versionNonce: 0, index: null,
    isDeleted: false, groupIds: [], frameId: null, boundElements: [],
    updated: Date.now(), link: null, roundness: null,
  };
  if (input.type === "frame") Object.assign(defaults, {
    name: null, order: 0, exportScale: 2, backgroundColor: "#ffffff", roughness: 0,
    roundness: { type: 3 },
  });
  if (input.type === "magicframe") defaults.name = null;
  if (input.type === "text") Object.assign(defaults, {
    text: "", originalText: input.text ?? "", fontSize: 20, fontFamily: 6,
    textAlign: "left", verticalAlign: "top", containerId: null,
    autoResize: false, lineHeight: 1.35,
  });
  if (input.type === "image") Object.assign(defaults, {
    fileId: null, status: "pending", scale: [1, 1], crop: null,
  });
  if (input.type === "line" || input.type === "arrow") Object.assign(defaults, {
    points: [[0, 0], [input.width, input.height]], lastCommittedPoint: null,
    startBinding: null, endBinding: null, startArrowhead: null,
    endArrowhead: input.type === "arrow" ? "arrow" : null,
    ...(input.type === "arrow" ? { elbowed: false } : {}),
  });
  if (input.type === "freedraw") Object.assign(defaults, {
    points: [], pressures: [], simulatePressure: true, lastCommittedPoint: null,
  });
  return NativeElementSchema.parse({ ...defaults, ...input });
}
