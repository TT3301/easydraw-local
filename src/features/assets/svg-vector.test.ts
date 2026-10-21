import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  parseSvgVector,
  parseSvgVectorBase64,
} from "./svg-vector";

describe("SVG vector paths", () => {
  it("loads the fixed picture logo as two tintable filled paths without a frame", () => {
    const source = readFileSync(new URL("../../../placeholder-library/image-placeholder-logo.svg", import.meta.url), "utf8");
    const vector = parseSvgVector(source);
    expect(vector?.viewBox).toEqual([0, 0, 24, 24]);
    expect(vector?.paths).toHaveLength(2);
    expect(vector?.paths.every(path => path.fill === "currentColor" && path.stroke === "none")).toBe(true);
    expect(source).not.toMatch(/<rect|stroke=/);
  });
  it("keeps the built-in image placeholder color-editable", () => {
    const source = readFileSync(
      new URL("../../../placeholder-library/image-placeholder-wireframe.svg", import.meta.url),
      "utf8",
    );
    const vector = parseSvgVector(source);

    expect(vector).not.toBeNull();
    expect(vector?.paths.length).toBeGreaterThan(0);
    expect(vector?.paths.every((path) => path.stroke === "currentColor")).toBe(
      true,
    );
  });

  it("preserves every SVG path command without flattening the curve", () => {
    const path =
      "M2 12 C2 4 10 2 14 6 S22 8 22 2 Q18 12 22 18 T12 22 A6 4 30 0 1 2 12 Z";
    const vector = parseSvgVector(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="${path}" stroke-linecap="round"/></svg>`,
    );

    expect(vector).not.toBeNull();
    expect(vector?.viewBox).toEqual([0, 0, 24, 24]);
    expect(vector?.content).toContain(`d="${path}"`);
    expect(vector?.content).toContain('stroke="currentColor"');
    expect(vector?.content).toContain('stroke-linecap="round"');
    expect(vector?.paths).toEqual([
      expect.objectContaining({
        d: path,
        fill: "none",
        stroke: "currentColor",
        lineCap: "round",
      }),
    ]);
  });

  it("keeps safe transforms and paint servers while removing active content", () => {
    const vector = parseSvgVector(`
      <svg viewBox="0 0 40 20" onload="alert(1)">
        <defs>
          <linearGradient id="paint"><stop offset="1" stop-color="currentColor"/></linearGradient>
        </defs>
        <g transform="translate(2 3)">
          <path d="M0 0 C10 0 10 10 20 10" fill="url(#paint)" onclick="alert(2)"/>
          <script>alert(3)</script>
          <image href="https://example.com/tracker.png"/>
        </g>
      </svg>
    `);

    expect(vector?.content).toContain("linearGradient");
    expect(vector?.content).toContain('transform="translate(2 3)"');
    expect(vector?.content).toContain('fill="url(#paint)"');
    expect(vector?.content).not.toContain("script");
    expect(vector?.content).not.toContain("onclick");
    expect(vector?.content).not.toContain("tracker.png");
    expect(vector?.paths[0]).toMatchObject({
      d: "M0 0 C10 0 10 10 20 10",
      transform: [1, 0, 0, 1, 2, 3],
    });
  });

  it("flattens inherited presentation and nested transforms into native path records", () => {
    const vector = parseSvgVector(`
      <svg viewBox="0 0 24 24" fill="currentColor" opacity="0.8">
        <g transform="translate(2 3) scale(2)" stroke="#fff" stroke-width="1.5">
          <path d="M0 0Q4 8 8 0Z" fill-rule="evenodd" fill-opacity="0.5"/>
        </g>
      </svg>
    `);

    expect(vector?.paths[0]).toMatchObject({
      d: "M0 0Q4 8 8 0Z",
      transform: [2, 0, 0, 2, 2, 3],
      fill: "currentColor",
      stroke: "#fff",
      strokeWidth: 1.5,
      fillRule: "evenodd",
      opacity: 0.8,
      fillOpacity: 0.5,
    });
  });

  it("decodes base64 SVG data and preserves its native path", () => {
    const source = '<svg width="32" height="16"><path d="M0 0L32 16" stroke="currentColor"/></svg>';
    const encoded = btoa(source);
    const vector = parseSvgVectorBase64(encoded);

    expect(vector?.viewBox).toEqual([0, 0, 32, 16]);
    expect(vector?.paths[0]).toMatchObject({ d: "M0 0L32 16", stroke: "currentColor" });
  });

});
