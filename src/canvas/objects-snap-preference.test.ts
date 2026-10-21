import { afterEach, describe, expect, it, vi } from "vitest";
import { readObjectsSnapPreference, saveObjectsSnapPreference } from "./objects-snap-preference";

afterEach(() => vi.unstubAllGlobals());

describe("objects snap preference", () => {
  it("defaults to off and restores both on and off after a restart", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    expect(readObjectsSnapPreference()).toBe(false);
    saveObjectsSnapPreference(true);
    expect(readObjectsSnapPreference()).toBe(true);
    saveObjectsSnapPreference(false);
    expect(readObjectsSnapPreference()).toBe(false);
    values.set("easydraw:objects-snap", "invalid");
    expect(readObjectsSnapPreference()).toBe(false);
  });

  it("keeps the editor usable when local storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("Storage unavailable"); },
      setItem: () => { throw new Error("Storage unavailable"); },
    });
    expect(readObjectsSnapPreference()).toBe(false);
    expect(() => saveObjectsSnapPreference(true)).not.toThrow();
  });
});
