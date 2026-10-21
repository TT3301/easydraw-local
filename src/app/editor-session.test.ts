import { describe, expect, it } from "vitest";
import { EditorSession } from "./editor-session";
import { SceneController } from "../core/scene-controller";
import { createInitialDocument, createDemoBatch } from "../core/protocol";

describe("project identity and revision", () => {
  it("rejects async work after reopening the same project ID and revision", async () => {
    const document = createInitialDocument();
    const controller = new SceneController(document);
    const session = new EditorSession(controller);
    const scope = session.capture();
    const pending = Promise.resolve().then(() => scope.controller.applyBatch(createDemoBatch(0)));
    session.replace(document);
    await expect(pending).rejects.toThrow("PROJECT_SESSION_EXPIRED");
    expect(controller.getSnapshot().document.revision).toBe(0);
  });
  it("rejects captured work when its owner is disposed without a project change", () => {
    const session = new EditorSession(new SceneController(createInitialDocument()));
    let alive = true;
    const scope = session.capture(() => alive);
    alive = false;
    expect(() => scope.controller.applyBatch(createDemoBatch(0))).toThrow("PROJECT_SESSION_EXPIRED");
  });
  it("issues new revisions for history navigation and rejects stale AI requests", () => {
    const controller = new SceneController(createInitialDocument());
    controller.applyBatch(createDemoBatch(0));
    controller.undo();
    expect(controller.getSnapshot().document.revision).toBe(2);
    expect(controller.applyBatch(createDemoBatch(0))).toMatchObject({ ok: false, code: "REVISION_CONFLICT" });
    controller.redo();
    expect(controller.getSnapshot().document.revision).toBe(3);
    controller.undo();
    expect(controller.applyBatch(createDemoBatch(4))).toMatchObject({ ok: true, revision: 5 });
  });
  it("keeps content revision and redo when focusing another page", () => {
    const controller = new SceneController(createInitialDocument());
    controller.commitProjectChange("second page", draft => {
      draft.scene.elements.push({ ...structuredClone(draft.scene.elements.find(element => element.type === "frame")!), id: "other-page" });
    });
    controller.applyBatch(createDemoBatch(1));
    controller.undo();
    expect(controller.setFocusedPage("other-page")).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ canRedo: true, document: { revision: 3 } });
    controller.redo();
    expect(controller.getSnapshot().document.focusedPageElementId).toBe("other-page");
  });
});
