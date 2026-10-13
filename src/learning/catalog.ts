import type { ExerciseContext, LabId, Track } from "./types";
const files = import.meta.glob<Track>("./content/*.json", {eager: true, import: "default"});
export const tracks: Track[] = Object.values(files).sort((a,b) => {
  const order = ["cpp", "dbms", "networking", "os", "sqlite", "duckdb", "pglite", "lld", "hld", "design-patterns"];
  return order.indexOf(a.id) - order.indexOf(b.id);
});
export function validateCatalog(catalog: Track[]) {
  const ids = new Set<string>();
  const addId = (id: string) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id)) throw new Error(`Learning content has an invalid or duplicate ID: ${id}`);
    ids.add(id);
  };
  const required = (...values: unknown[]) => { if (values.some(v => typeof v !== "string" || !v.trim())) throw new Error("Learning content has a missing text field."); };
  const labs: LabId[] = ["cpp", "sqlite", "duckdb", "pglite"];
  for (const track of catalog) {
    addId(track.id); required(track.title, track.description, track.shortLabel);
    if (track.lab && !labs.includes(track.lab)) throw new Error("Unknown lab.");
    if (!["Programming", "Databases", "Computer science", "System design"].includes(track.category)) throw new Error("Unknown track category.");
    if (!track.modules.length) throw new Error("A track needs at least one module.");
    for (const module of track.modules) {
      addId(`${track.id}-${module.id}`); required(module.title, module.description);
      if (!module.lessons.length) throw new Error("A module needs at least one lesson.");
      for (const lesson of module.lessons) {
        addId(`${track.id}-${module.id}-${lesson.id}`); required(lesson.title, lesson.body);
        if (!Number.isFinite(lesson.minutes) || lesson.minutes <= 0) throw new Error("Invalid lesson duration.");
      }
      for (const exercise of module.exercises) {
        addId(exercise.id); required(exercise.title, exercise.prompt, exercise.answer);
        if (!["Beginner", "Intermediate", "Advanced"].includes(exercise.difficulty)) throw new Error("Unknown exercise difficulty.");
        if (exercise.lab && (!labs.includes(exercise.lab) || exercise.lab !== track.lab || !exercise.starter)) throw new Error("An exercise needs a matching lab and starter code.");
        if (exercise.setup && !exercise.lab) throw new Error("Exercise setup requires a lab.");
        exercise.hints.forEach(hint => required(hint));
      }
      for (const resource of module.resources) {
        required(resource.title, resource.url);
        const url = resource.url.startsWith("/") && !resource.url.startsWith("//") ? new URL(resource.url, "https://local.invalid") : new URL(resource.url);
        if (!["https:", "http:"].includes(url.protocol)) throw new Error("Resources must use HTTP or HTTPS URLs.");
        if (!["Documentation", "Article", "Video", "Book", "Notes"].includes(resource.kind)) throw new Error("Unknown resource kind.");
      }
    }
  }
}
validateCatalog(tracks);
export function findExercise(id: string): ExerciseContext | undefined {
  for (const track of tracks) for (const module of track.modules) {
    const exercise = module.exercises.find(e => e.id === id);
    if (exercise) return {track, module, exercise};
  }
}
export const moduleHref = (context: ExerciseContext) => `/learn/${context.track.id}/${context.module.id}?exercise=${context.exercise.id}`;
export const labHref = (context: ExerciseContext) => context.exercise.lab ? `${context.exercise.lab === "cpp" ? "/" : `/labs/${context.exercise.lab}`}?exercise=${context.exercise.id}` : moduleHref(context);
