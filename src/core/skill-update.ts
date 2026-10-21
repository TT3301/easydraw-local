export const SKILL_UPDATE_STORAGE_KEY = "easydraw.skills.acknowledgedHash";

export function hasSkillUpdate(hash: string, storage: Pick<Storage, "getItem" | "setItem">) {
  const acknowledgedHash = storage.getItem(SKILL_UPDATE_STORAGE_KEY);
  if (!acknowledgedHash) {
    storage.setItem(SKILL_UPDATE_STORAGE_KEY, hash);
    return false;
  }
  return acknowledgedHash !== hash;
}
