import "./engine-test-globals";
import { describe, it, expect, vi, beforeAll } from "vitest";
vi.mock("@easydraw/canvas-engine/editor/fonts/Fonts", () => ({ Fonts: { loadElementsFonts: vi.fn(async () => {}) } }));
import { setCustomTextMetricsProvider } from "@easydraw/canvas-engine/editor/element/textMeasurements";
import { ApplyOperationsSchema, createInitialDocument, type ProjectDocument } from "../../core/protocol";
import { executeCanvasOperations } from "../../core/canvas-commands";
import { layoutCanvasText } from "./canvas-runtime";
import { textLayoutTargets } from "./text-layout";

// Deterministic metrics: 10px per character.
beforeAll(() => setCustomTextMetricsProvider({ getLineWidth: text => text.length * 10 }));
const empty = (): ProjectDocument => ({ ...createInitialDocument(), focusedPageElementId: null, scene: { elements: [] } });
async function write(operations: unknown[], document = empty()) {
  const { draft } = executeCanvasOperations(document, ApplyOperationsSchema.parse({ documentId: document.projectId, canvasId: document.activeCanvasId!, baseRevision: 0, requestId: "t", label: "T", operations }), new Map());
  await layoutCanvasText(document, draft);
  return draft;
}
const text = (draft: ProjectDocument, id = "t") => draft.scene.elements.find(e => e.id === id) as Extract<ProjectDocument["scene"]["elements"][number], { type: "text" }>;
const lines = (count: number) => count * 20 * 1.25;
const base = { id: "t", type: "text", x: 0, y: 0, width: 200, height: 60, fontSize: 20, lineHeight: 1.25 };

describe("API text layout", () => {
  it("fits autoResize text on create and on text update", async () => {
    const created = await write([{ op: "create", element: { ...base, text: "abc\nabcdefghijklmnopqrstuvwxyz", autoResize: true } }]);
    expect(text(created)).toMatchObject({ width: 260, height: lines(2) });
    const updated = await write([{ op: "update", id: "t", patch: { text: "one line" } }], created);
    expect(text(updated)).toMatchObject({ text: "one line", width: 80, height: lines(1) });
  });

  it("defaults new text to fit its content, like the editor's text tool", async () => {
    const draft = await write([{ op: "create", element: { ...base, text: "hello" } },
      { op: "create", element: { ...base, id: "fixed", text: "hello", autoResize: false } }]);
    expect(text(draft)).toMatchObject({ autoResize: true, width: 50, height: lines(1) });
    expect(text(draft, "fixed")).toMatchObject({ autoResize: false, width: 200 });
  });

  it("keeps the width of fixed-width text, wraps to it and fits the height", async () => {
    const draft = await write([{ op: "create", element: { ...base, width: 100, text: "aaaa bbbb cccc", autoResize: false } }]);
    expect(text(draft)).toMatchObject({ width: 100, height: lines(2), originalText: "aaaa bbbb cccc" });
    expect(text(draft).text.split("\n")).toHaveLength(2);
    const unwrapped = await write([{ op: "update", id: "t", patch: { autoResize: true } }], draft);
    expect(text(unwrapped)).toMatchObject({ text: "aaaa bbbb cccc", width: 140, height: lines(1) });
  });

  it("positions bound text by verticalAlign inside its container", async () => {
    const shape = { op: "create", element: { id: "box", type: "rectangle", x: 0, y: 0, width: 200, height: 200 } };
    const label = (verticalAlign: string) => ({ op: "create", element: { ...base, containerId: "box", text: "hi", verticalAlign, textAlign: "center" } });
    const top = text(await write([shape, label("top")])), middle = text(await write([shape, label("middle")])), bottom = text(await write([shape, label("bottom")]));
    expect(top.y).toBeLessThan(middle.y);
    expect(middle.y).toBeLessThan(bottom.y);
    expect(middle.y + middle.height / 2).toBeCloseTo(100);
    expect(middle.x + middle.width / 2).toBeCloseTo(100);
  });

  it("only lays out text that the write could have changed", async () => {
    const draft = await write([{ op: "create", element: { id: "box", type: "rectangle", x: 0, y: 0, width: 200, height: 200 } },
      { op: "create", element: { ...base, id: "free", text: "free" } }, { op: "create", element: { ...base, id: "label", containerId: "box", text: "label" } }]);
    const moved = executeCanvasOperations(draft, ApplyOperationsSchema.parse({ documentId: draft.projectId, canvasId: draft.activeCanvasId!, baseRevision: 0, requestId: "m", label: "M",
      operations: [{ op: "update", id: "box", patch: { width: 300 } }, { op: "update", id: "free", patch: { strokeColor: "#ff0000" } }] }), new Map()).draft;
    expect(textLayoutTargets(draft.scene.elements, moved.scene.elements).map(e => e.id)).toEqual(["label"]);
  });
});
