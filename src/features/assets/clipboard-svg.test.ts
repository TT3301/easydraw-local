import { describe, expect, it } from "vitest";

import { extractClipboardSvg } from "./clipboard-svg";

describe("clipboard SVG detection", () => {
  it("accepts raw iconfont SVG markup", () => {
    const svg = '<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
    expect(extractClipboardSvg(svg)).toBe(svg);
  });

  it("unwraps an SVG code fence", () => {
    expect(
      extractClipboardSvg(`\`\`\`svg
        <svg viewBox="0 0 16 16"><path d="M0 0h16v16z"/></svg>
      \`\`\``),
    ).toBe('<svg viewBox="0 0 16 16"><path d="M0 0h16v16z"/></svg>');
  });

  it("allows an XML declaration and leading comments", () => {
    expect(
      extractClipboardSvg(
        '<?xml version="1.0"?><!-- icon --><svg width="12" height="8"><path d="M0 0h12v8z"/></svg>',
      ),
    ).toBe('<svg width="12" height="8"><path d="M0 0h12v8z"/></svg>');
  });

  it("does not intercept ordinary or partial text", () => {
    expect(extractClipboardSvg("hello <svg></svg>")).toBeNull();
    expect(extractClipboardSvg("<svg><path/></svg> trailing text")).toBeNull();
    expect(extractClipboardSvg("const icon = '<svg></svg>';")).toBeNull();
  });
});
