import type { ProjectFile } from "../types";

export const PROJECT_LIMITS = {
  maxFiles: 100,
  maxFileBytes: 512 * 1024,
  maxProjectBytes: 2 * 1024 * 1024,
  maxPathLength: 160,
} as const;

type StoredProject = {
  version: 1;
  files: ProjectFile[];
};

export type ProjectValidation =
  | { ok: true; totalBytes: number }
  | { ok: false; error: string };

export function normalizeProjectPath(input: string) {
  const path = input.trim().replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!path || path.endsWith("/")) return { ok: false as const, error: "Enter a file path, not a folder." };
  if (path.length > PROJECT_LIMITS.maxPathLength) return { ok: false as const, error: `Paths are limited to ${PROJECT_LIMITS.maxPathLength} characters.` };
  if (path.split("/").some((part) => part === ".." || part === "." || !part)) return { ok: false as const, error: "Relative path segments are not allowed." };
  if (!/^[\w./+@-]+$/.test(path)) return { ok: false as const, error: "Use letters, numbers, dots, dashes, underscores, or folders." };
  return { ok: true as const, path };
}

export function validateProjectFiles(files: ProjectFile[]): ProjectValidation {
  if (!files.length) return { ok: false, error: "The project must contain at least one file." };
  if (files.length > PROJECT_LIMITS.maxFiles) return { ok: false, error: `Projects are limited to ${PROJECT_LIMITS.maxFiles} files.` };

  const encoder = new TextEncoder();
  const paths = new Set<string>();
  let totalBytes = 0;
  for (const file of files) {
    const normalized = normalizeProjectPath(file.path);
    if (!normalized.ok || normalized.path !== file.path) return { ok: false, error: `Invalid project path: ${file.path}` };
    if (paths.has(file.path)) return { ok: false, error: `Duplicate project path: ${file.path}` };
    paths.add(file.path);

    const fileBytes = encoder.encode(file.content).byteLength;
    if (fileBytes > PROJECT_LIMITS.maxFileBytes) return { ok: false, error: `${file.path} exceeds the 512 KB file limit.` };
    totalBytes += fileBytes;
    if (totalBytes > PROJECT_LIMITS.maxProjectBytes) return { ok: false, error: "The project exceeds the 2 MB workspace limit." };
  }
  return { ok: true, totalBytes };
}

export function findEntryFile(files: ProjectFile[]) {
  return files.find((file) => file.path === "main.cpp")
    || files.find((file) => !file.path.includes("/") && /\.(cpp|cc|cxx)$/i.test(file.path))
    || files.find((file) => /\.(cpp|cc|cxx)$/i.test(file.path));
}

export function loadStoredProject(storage: Storage, key: string, defaults: ProjectFile[]) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || "null") as StoredProject | ProjectFile[] | null;
    const files = Array.isArray(parsed) ? parsed : parsed?.version === 1 ? parsed.files : null;
    if (files && validateProjectFiles(files).ok) return files.map((file) => ({ ...file }));
  } catch {
    // Fall back to defaults when local storage contains an invalid or older draft.
  }
  return defaults.map((file) => ({ ...file }));
}

export function saveStoredProject(storage: Storage, key: string, files: ProjectFile[]) {
  const validation = validateProjectFiles(files);
  if (!validation.ok) return validation;
  try {
    const payload: StoredProject = { version: 1, files };
    storage.setItem(key, JSON.stringify(payload));
    return validation;
  } catch {
    return { ok: false as const, error: "The browser could not save this project. Local storage may be full or disabled." };
  }
}
