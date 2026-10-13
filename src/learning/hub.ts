import DOMPurify from "dompurify";
import { marked } from "marked";
import { tracks, labHref } from "./catalog";
import { exerciseKey, lessonKey, loadProgress, saveProgress } from "./progress";
import type { LearningModule, Track, Exercise } from "./types";
import "./hub.css";
const escape = (value: string) => value.replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]!));
const markdown = (value: string) => DOMPurify.sanitize(marked.parse(value, {async:false}));
const modulePath = (track: Track, module: LearningModule) => `/learn/${track.id}/${module.id}`;

export function renderLearningHub(app: HTMLDivElement) {
  document.body.classList.add("learning-page");
  let progress = loadProgress(localStorage);
  let query = "", category = "All tracks";
  const keys = (track: Track, module: LearningModule) => [...module.lessons.map(l => lessonKey(track.id,module.id,l.id)), ...module.exercises.map(e => exerciseKey(e.id))];
  const done = (track: Track, module: LearningModule) => keys(track,module).filter(k => progress.completed.has(k)).length;
  const header = () => `<header class="lh-header"><a class="lh-brand" href="/welcome"><span>{ }</span>Local WASM Labs</a><nav aria-label="Learning navigation"><a class="active" href="/learn" data-learn-link>Learn</a><a href="/">C++ Lab</a><a href="/labs/sqlite">SQL Labs</a><a href="/welcome">Home</a></nav></header>`;
  function shell(content: string) { app.innerHTML = `<div class="lh-shell">${header()}<main id="learning-main">${content}</main><footer class="lh-footer"><span>Read a concept. Try it in a lab. Build your understanding.</span><span>Progress and notes are saved in this browser.</span></footer></div>`; }
  function save() { const ok = saveProgress(localStorage,progress); const status = app.querySelector("#lh-save-status"); if (status) status.textContent = ok ? "Saved in this browser" : "Browser storage is unavailable; changes are temporary."; return ok; }
  function resourceList(module: LearningModule) {
    return `<section class="lh-resources" aria-label="Module resources"><h3>Further reading</h3>${module.resources.length ? module.resources.map(r => `<a href="${escape(r.url)}" target="_blank" rel="noopener noreferrer"><span>${escape(r.title)}</span><small>${escape(r.kind)} ↗</small></a>`).join("") : '<p>No extra resources in this module yet.</p>'}</section>`;
  }
  function renderCards() {
    const visible = tracks.filter(t => (category === "All tracks" || t.category === category) && [t.title,t.description,...t.modules.flatMap(m => [m.title,...m.lessons.map(l=>l.title),...m.exercises.map(e=>e.title)])].join(" ").toLowerCase().includes(query.toLowerCase()));
    app.querySelector("#lh-track-count")!.textContent = `${visible.length} learning ${visible.length === 1 ? "track" : "tracks"}`;
    app.querySelector("#lh-tracks")!.innerHTML = visible.length ? visible.map(track => {
      const allKeys = track.modules.flatMap(m => keys(track,m)), completed = allKeys.filter(k => progress.completed.has(k)).length;
      return `<article class="lh-track"><div class="lh-track-top"><span class="lh-track-symbol">${escape(track.shortLabel)}</span><small>${escape(track.category)}</small></div><h2>${escape(track.title)}</h2><p>${escape(track.description)}</p><div class="lh-track-counts">${track.modules.length} module${track.modules.length === 1 ? "" : "s"} · ${track.modules.reduce((n,m)=>n+m.lessons.length,0)} lessons · ${track.modules.reduce((n,m)=>n+m.exercises.length,0)} exercise${track.modules.reduce((n,m)=>n+m.exercises.length,0) === 1 ? "" : "s"}</div><progress max="${allKeys.length}" value="${completed}" aria-label="${escape(track.title)} progress"></progress><span class="lh-progress-label">${completed} / ${allKeys.length} complete</span><div class="lh-module-links">${track.modules.map(m => `<a href="${modulePath(track,m)}" data-learn-link><span>${escape(m.title)}</span><span aria-hidden="true">→</span></a>`).join("")}</div></article>`;
    }).join("") : '<p class="lh-empty">No tracks match your search. Try another topic.</p>';
  }
  function hub() {
    document.title = "Learn · Local WASM Labs";
    shell(`<section class="lh-intro"><p class="lh-kicker">THE LEARNING WORKBENCH</p><h1>Understand it.<br><em>Then build it.</em></h1><p>Follow a module, work through an exercise, and take the idea into a lab. Learn algorithms, databases, computer systems, and software design at your own pace.</p><div class="lh-hub-stats"><span>${tracks.length} tracks</span><span>${tracks.reduce((n,t)=>n+t.modules.length,0)} starter modules</span><span>Reading + practice</span></div></section><section class="lh-library"><div class="lh-library-tools"><h2>Your learning paths <span id="lh-track-count"></span></h2><label class="lh-search"><span class="sr-only">Search learning tracks</span><input id="lh-search" type="search" placeholder="Search topics, lessons, exercises…" value="${escape(query)}"></label></div><div class="lh-filters" role="group" aria-label="Filter learning tracks">${["All tracks","Programming","Databases","Computer science","System design"].map(c => `<button data-category="${c}" aria-pressed="${category === c}">${c}</button>`).join("")}</div><div class="lh-tracks" id="lh-tracks"></div></section>`);
    renderCards();
    app.querySelector<HTMLInputElement>("#lh-search")!.oninput = event => { query = (event.target as HTMLInputElement).value; renderCards(); };
    for (const button of app.querySelectorAll<HTMLButtonElement>("[data-category]")) button.onclick = () => { category = button.dataset.category!; for (const b of app.querySelectorAll("[data-category]")) b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.category === category)); renderCards(); };
  }
  function modulePage(track: Track, module: LearningModule, lessonId?: string, exerciseId?: string) {
    const exercise = exerciseId ? module.exercises.find(e=>e.id===exerciseId) : undefined;
    const lesson = !exerciseId ? module.lessons.find(l=>l.id===lessonId) ?? (!lessonId ? module.lessons[0] : undefined) : undefined;
    if (!lesson && !exercise) { missing(); return; }
    const selectedKey = exercise ? exerciseKey(exercise.id) : lessonKey(track.id,module.id,lesson!.id);
    document.title = `${exercise?.title ?? lesson!.title} · ${track.title}`;
    const base = modulePath(track,module);
    shell(`<div class="lh-breadcrumb"><a href="/learn" data-learn-link>Learning paths</a><span>/</span><span>${escape(track.title)}</span><span>/</span><span>${escape(module.title)}</span></div><div class="lh-reader"><aside class="lh-outline"><p class="lh-kicker">${escape(track.title)}</p><h2>${escape(module.title)}</h2><p>${escape(module.description)}</p><div class="lh-outline-progress"><progress max="${keys(track,module).length}" value="${done(track,module)}" aria-label="Module progress"></progress><span>${done(track,module)} / ${keys(track,module).length} complete</span></div><h3>Lessons</h3><nav aria-label="Module lessons">${module.lessons.map((l,i) => `<a ${lesson?.id===l.id ? 'aria-current="page"' : ""} href="${base}?lesson=${l.id}" data-learn-link><span>${progress.completed.has(lessonKey(track.id,module.id,l.id)) ? "✓" : String(i+1).padStart(2,"0")}</span><div>${escape(l.title)}<small>${l.minutes} min read</small></div></a>`).join("")}</nav><h3>Practice</h3><nav aria-label="Module exercises">${module.exercises.map(e => `<a ${exercise?.id===e.id ? 'aria-current="page"' : ""} href="${base}?exercise=${e.id}" data-learn-link><span>${progress.completed.has(exerciseKey(e.id)) ? "✓" : "↗"}</span><div>${escape(e.title)}<small>${escape(e.difficulty)} · ${e.lab ? "Lab exercise" : "Design / theory exercise"}</small></div></a>`).join("")}</nav>${resourceList(module)}</aside><article class="lh-content"><div class="lh-content-meta">${exercise ? `PRACTICE · ${escape(exercise.difficulty.toUpperCase())}` : `${lesson!.minutes} MIN READ · LESSON ${module.lessons.indexOf(lesson!)+1}`}</div><h1>${escape(exercise?.title ?? lesson!.title)}</h1>${exercise ? exerciseContent(track,module,exercise) : `<div class="lh-prose">${markdown(lesson!.body)}</div>`}<div class="lh-completion"><button id="lh-complete" class="lh-primary" aria-pressed="${progress.completed.has(selectedKey)}">${progress.completed.has(selectedKey) ? "Completed · mark incomplete" : exercise ? "Mark exercise complete" : "Mark lesson complete"}</button><span>${exercise ? "Self-reported after reviewing your work." : "Track your reading progress."}</span></div><p id="lh-save-status" role="status" class="lh-save-status"></p>${lesson ? nextLink(track,module,lesson.id) : ""}</article></div>`);
    app.querySelector<HTMLButtonElement>("#lh-complete")!.onclick = () => {
      if (progress.completed.has(selectedKey)) progress.completed.delete(selectedKey); else progress.completed.add(selectedKey);
      const ok = save(); modulePage(track,module,lessonId,exerciseId);
      app.querySelector("#lh-save-status")!.textContent = ok ? "Progress saved in this browser" : "Browser storage is unavailable; changes are temporary.";
    };
    const notes = app.querySelector<HTMLTextAreaElement>("#lh-notes");
    if (notes && exercise) notes.oninput = () => { progress.notes[exercise.id] = notes.value; save(); };
  }
  function exerciseContent(track: Track, module: LearningModule, exercise: Exercise) {
    return `<div class="lh-prose">${markdown(exercise.prompt)}</div>${exercise.lab ? `<div class="lh-lab-callout"><div><strong>Take it into the ${exercise.lab === "cpp" ? "C++" : exercise.lab === "pglite" ? "PGlite" : exercise.lab === "duckdb" ? "DuckDB" : "SQLite"} lab.</strong><p>The exercise opens with its own draft. Your regular lab draft stays separate.${exercise.setup ? " Load the exercise data once inside the lab." : ""}</p></div><a class="lh-primary" href="${labHref({track,module,exercise})}">Open exercise in lab ↗</a></div>` : '<p class="lh-theory-note">Use the notes below to work through this design or theory exercise.</p>'}${exercise.expected ? `<details class="lh-hint"><summary>Expected result</summary><pre>${escape(exercise.expected)}</pre></details>` : ""}<div class="lh-hints">${exercise.hints.map((hint,i) => `<details class="lh-hint"><summary>Hint ${i+1}</summary><div class="lh-prose">${markdown(hint)}</div></details>`).join("")}</div><label class="lh-notes">Your approach<textarea id="lh-notes" rows="7" maxlength="50000" placeholder="Write your reasoning, sketch a design, or record what you learned…">${escape(progress.notes[exercise.id] ?? "")}</textarea></label><details class="lh-answer"><summary>Review a reference approach</summary><div class="lh-prose">${markdown(exercise.answer)}</div></details>`;
  }
  function nextLink(track: Track, module: LearningModule, id: string) {
    const next = module.lessons[module.lessons.findIndex(l=>l.id===id)+1];
    if (next) return `<a class="lh-next" data-learn-link href="${modulePath(track,module)}?lesson=${next.id}">Next lesson: ${escape(next.title)} →</a>`;
    const exercise = module.exercises[0];
    return exercise ? `<a class="lh-next" data-learn-link href="${modulePath(track,module)}?exercise=${exercise.id}">Put it into practice: ${escape(exercise.title)} →</a>` : '<a class="lh-next" href="/learn" data-learn-link>Back to learning paths →</a>';
  }
  function missing() { document.title = "Content not found · Local WASM Labs"; shell('<section class="lh-intro"><p class="lh-kicker">CONTENT NOT FOUND</p><h1>This page is not in the curriculum.</h1><p>Choose a module from the learning paths.</p><a class="lh-primary" href="/learn" data-learn-link>Browse learning paths</a></section>'); }
  function render() {
    progress = loadProgress(localStorage);
    const segments = window.location.pathname.split("/").filter(Boolean);
    if (segments.length === 1) { hub(); return; }
    const track = tracks.find(t=>t.id===segments[1]);
    if (!track || segments.length > 3) { missing(); return; }
    const module = track.modules.find(m=>m.id===segments[2]) ?? (!segments[2] ? track.modules[0] : undefined);
    if (!module) { missing(); return; }
    const params = new URLSearchParams(window.location.search);
    modulePage(track,module,params.get("lesson") ?? undefined,params.get("exercise") ?? undefined);
  }
  app.addEventListener("click", event => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-learn-link]");
    const mouse = event as MouseEvent;
    if (!anchor || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey || mouse.button !== 0) return;
    event.preventDefault(); history.pushState(null,"",anchor.href); render(); window.scrollTo(0,0);
  });
  window.addEventListener("popstate", render);
  window.addEventListener("storage", event => { if (event.key === "local-wasm-labs:learning-progress-v1") render(); });
  render();
}
