import { expect, it } from "vitest";
import { z } from "zod";
import { CANVAS_TOOL_SCHEMAS, CanvasScopeSchema, ProjectTreeOperationSchema, ApplyOperationsSchema } from "./canvas";

it("declares object argument types alongside their union branches for MCP clients", () => {
  for (const schema of Object.values(CANVAS_TOOL_SCHEMAS)) {
    const published = z.toJSONSchema(schema, { target: "draft-7", io: "input", unrepresentable: "any" });
    const properties = published.properties as Record<string, { type?: string; oneOf?: unknown[] }>;
    for (const field of ["scope", "operation", "coordinateSpace"]) {
      if (!properties[field]) continue;
      expect(properties[field].type).toBe("object");
      expect(properties[field].oneOf?.length).toBeGreaterThan(1);
    }
  }
});

it("keeps scope and project operation validation strict", () => {
  expect(CanvasScopeSchema.safeParse({ kind: "document" }).success).toBe(true);
  expect(CanvasScopeSchema.safeParse('{"kind":"document"}').success).toBe(false);
  expect(CanvasScopeSchema.safeParse({ kind: "container" }).success).toBe(false);
  expect(CanvasScopeSchema.safeParse({ kind: "document", id: "wrong-branch" }).success).toBe(false);
  const operation = { op: "create", type: "canvas", parentId: null };
  expect(ProjectTreeOperationSchema.safeParse(operation).success).toBe(true);
  expect(ProjectTreeOperationSchema.safeParse(JSON.stringify(operation)).success).toBe(false);
  expect(ProjectTreeOperationSchema.safeParse({ op: "rename", id: "canvas" }).success).toBe(false);
});

it("keeps the coordinate-space default and explicit container requirements", () => {
  const input = { documentId: "test", canvasId: "canvas", baseRevision: 0, requestId: "test", label: "test",
    operations: [{ op: "create", element: { type: "rectangle", x: 0, y: 0, width: 10, height: 10 } }],
  };
  expect(ApplyOperationsSchema.parse(input).coordinateSpace).toEqual({ kind: "canvas" });
  expect(ApplyOperationsSchema.parse({ ...input, coordinateSpace: { kind: "container", id: "frame" } }).coordinateSpace).toEqual({ kind: "container", id: "frame" });
  expect(ApplyOperationsSchema.safeParse({ ...input, coordinateSpace: { kind: "container" } }).success).toBe(false);
});
