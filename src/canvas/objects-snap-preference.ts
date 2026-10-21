const STORAGE_KEY = "easydraw:objects-snap";

export const readObjectsSnapPreference = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

export const saveObjectsSnapPreference = (enabled: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch { /* best effort, matching other local canvas preferences */ }
};
