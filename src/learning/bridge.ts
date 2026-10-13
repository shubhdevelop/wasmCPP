import type { ExerciseContext } from "./types";
import { exerciseKey, loadProgress, saveProgress } from "./progress";
import "./bridge.css";
export function createExercisePanel(context: ExerciseContext) {
  const panel = document.createElement("section"); panel.className = "exercise-panel";
  const heading = document.createElement("h2"); heading.textContent = context.exercise.title;
  const meta = document.createElement("p"); meta.className = "exercise-meta"; meta.textContent = `${context.track.title} · ${context.exercise.difficulty}`;
  const prompt = document.createElement("p"); prompt.textContent = context.exercise.prompt;
  panel.append(meta, heading, prompt);
  if (context.exercise.expected) {
    const details = document.createElement("details"), summary = document.createElement("summary"), expected = document.createElement("pre");
    summary.textContent = "Expected result"; expected.textContent = context.exercise.expected; details.append(summary, expected); panel.append(details);
  }
  for (const [i,hint] of context.exercise.hints.entries()) {
    const details = document.createElement("details"), summary = document.createElement("summary"), text = document.createElement("p");
    summary.textContent = `Hint ${i+1}`; text.textContent = hint; details.append(summary,text); panel.append(details);
  }
  const button = document.createElement("button"); button.className = "ghost-button";
  const progress = loadProgress(localStorage), key = exerciseKey(context.exercise.id);
  const update = () => { button.textContent = progress.completed.has(key) ? "Completed · undo" : "Mark complete"; button.setAttribute("aria-pressed", String(progress.completed.has(key))); };
  button.onclick = () => {
    const current = loadProgress(localStorage);
    if (current.completed.has(key)) current.completed.delete(key); else current.completed.add(key);
    progress.completed = current.completed;
    if (!saveProgress(localStorage, current)) note.textContent = "Progress could not be saved in this browser.";
    update();
  };
  const note = document.createElement("p"); note.className = "exercise-meta"; note.textContent = "Completion is self-reported. Compare your result before marking complete.";
  const back = document.createElement("a"); back.textContent = "← Back to module"; back.href = `/learn/${context.track.id}/${context.module.id}?exercise=${context.exercise.id}`;
  panel.append(button,note,back); update(); return panel;
}
