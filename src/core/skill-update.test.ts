import { describe, expect, it, vi } from "vitest";
import { hasSkillUpdate, SKILL_UPDATE_STORAGE_KEY } from "./skill-update";
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
describe("skill update acknowledgement", () => {
  it("records a first-use baseline without showing an update", () => {
    const saved = storage();
    expect(hasSkillUpdate("initial", saved)).toBe(false);
    expect(saved.getItem(SKILL_UPDATE_STORAGE_KEY)).toBe("initial");
    expect(hasSkillUpdate("initial", saved)).toBe(false);
  });
  it("keeps changes unread across reloads and clears only after acknowledging the current content", () => {
    const saved = storage();
    hasSkillUpdate("initial", saved);
    expect(hasSkillUpdate("updated", saved)).toBe(true);
    expect(hasSkillUpdate("updated", saved)).toBe(true);
    expect(saved.getItem(SKILL_UPDATE_STORAGE_KEY)).toBe("initial");
    saved.setItem(SKILL_UPDATE_STORAGE_KEY, "updated");
    expect(hasSkillUpdate("updated", saved)).toBe(false);
    expect(hasSkillUpdate("updated-again", saved)).toBe(true);
  });
  it("reports storage failures instead of claiming a saved acknowledgement", () => {
    const saved = storage();
    vi.spyOn(saved, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    expect(() => hasSkillUpdate("initial", saved)).toThrow("Storage unavailable");
    expect(saved.getItem(SKILL_UPDATE_STORAGE_KEY)).toBeNull();
  });
});
