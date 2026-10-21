import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { readSvgDimensions, validateSvg } = require("./svg-dimensions.cjs") as {
  readSvgDimensions(input: string | Buffer): {
    width: number;
    height: number;
  };
  validateSvg(input: string | Buffer): string;
};

describe("SVG dimensions", () => {
  it("reads explicit pixel dimensions", () => {
    expect(
      readSvgDimensions('<svg width="120" height="80"></svg>'),
    ).toEqual({ width: 120, height: 80 });
  });

  it("uses viewBox dimensions when width and height are omitted", () => {
    expect(
      readSvgDimensions('<svg viewBox="0 0 48 32"></svg>'),
    ).toEqual({ width: 48, height: 32 });
  });

  it("preserves the viewBox aspect ratio with one explicit dimension", () => {
    expect(
      readSvgDimensions(
        '<svg width="96px" viewBox="-12 -8 48 24"></svg>',
      ),
    ).toEqual({ width: 96, height: 48 });
  });

  it("supports common physical SVG units", () => {
    expect(
      readSvgDimensions('<svg width="1in" height="25.4mm"></svg>'),
    ).toEqual({ width: 96, height: 96 });
  });

  it("rejects executable SVG content", () => {
    expect(() =>
      validateSvg(
        '<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>',
      ),
    ).toThrow("SVG 包含脚本");
  });
});
