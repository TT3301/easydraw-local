import type { ProjectDocument } from "@easydraw/editor-contracts";
export * from "@easydraw/editor-contracts";
export { createInitialDocument, createDemoBatch } from "./document-fixtures";
import { getPageElements } from "@easydraw/document-model";
export { getPageElements, getPageMembers } from "@easydraw/document-model";

export const getFocusedPage = (document: ProjectDocument) =>
  getPageElements(document).find(
    (page) => page.id === document.focusedPageElementId,
  ) ?? null;
