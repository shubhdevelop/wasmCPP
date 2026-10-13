export type LabId = "cpp" | "sqlite" | "duckdb" | "pglite";
export type Resource = { title: string; url: string; kind: "Documentation" | "Article" | "Video" | "Book" | "Notes" };
export type Lesson = { id: string; title: string; minutes: number; body: string };
export type Exercise = {
  id: string; title: string; difficulty: "Beginner" | "Intermediate" | "Advanced";
  prompt: string; hints: string[]; answer: string; expected?: string;
  lab?: LabId; starter?: string; setup?: string; stdin?: string;
};
export type LearningModule = {
  id: string; title: string; description: string;
  lessons: Lesson[]; exercises: Exercise[]; resources: Resource[];
};
export type Track = {
  id: string; title: string; shortLabel: string; category: "Programming" | "Databases" | "Computer science" | "System design";
  description: string; lab?: LabId; modules: LearningModule[];
};
export type ExerciseContext = { track: Track; module: LearningModule; exercise: Exercise };
