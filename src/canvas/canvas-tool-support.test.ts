import { describe, expect, it } from "vitest";
import { isSupportedCanvasTool } from "./canvas-tool-support";

describe("canvas tool support", () => {
  it("keeps diamond as the active toolbar shape", () => {
    expect(isSupportedCanvasTool("diamond")).toBe(true);
  });
});
