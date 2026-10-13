export const PROGRESS_KEY = "local-wasm-labs:learning-progress-v1";
export type Progress = { completed: Set<string>; notes: Record<string, string> };
export function loadProgress(storage: Pick<Storage, "getItem">): Progress {
  try {
    const stored = JSON.parse(storage.getItem(PROGRESS_KEY) ?? "null");
    return {
      completed: new Set(Array.isArray(stored?.completed) ? stored.completed.filter((v: unknown) => typeof v === "string" && v.length < 200) : []),
      notes: Object.fromEntries(Object.entries(stored?.notes && typeof stored.notes === "object" && !Array.isArray(stored.notes) ? stored.notes : {}).filter(([id,v]) => id.length < 200 && typeof v === "string" && v.length <= 50_000)) as Record<string, string>,
    };
  } catch { return {completed: new Set(), notes: {}}; }
}
export function saveProgress(storage: Pick<Storage, "setItem">, progress: Progress) {
  try { storage.setItem(PROGRESS_KEY, JSON.stringify({completed: [...progress.completed], notes: progress.notes})); return true; }
  catch { return false; }
}
export const lessonKey = (track: string, module: string, lesson: string) => `${track}/${module}/lesson/${lesson}`;
export const exerciseKey = (id: string) => `exercise/${id}`;
