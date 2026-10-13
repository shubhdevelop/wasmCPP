export const clampSize = (value: number, min: number, max: number) => Math.min(Math.max(value,min),Math.max(min,max));
export function bindResize(handle: HTMLElement, axis: "x" | "y", bounds: () => {current:number;min:number;max:number}, set: (value:number)=>void, commit: ()=>void) {
  const update = (value: number) => {
    const {min,max} = bounds(); const next = clampSize(value,min,max); set(next);
    handle.setAttribute("aria-valuemin",String(Math.round(min))); handle.setAttribute("aria-valuemax",String(Math.round(Math.max(min,max)))); handle.setAttribute("aria-valuenow",String(Math.round(next)));
  };
  const initial = bounds(); update(initial.current);
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault(); handle.focus(); handle.setPointerCapture(event.pointerId);
    const start = axis === "x" ? event.clientX : event.clientY, current = bounds().current;
    const move = (e: PointerEvent) => update(current + (axis === "x" ? e.clientX : e.clientY) - start);
    const stop = () => {
      handle.removeEventListener("pointermove",move); handle.removeEventListener("pointerup",stop); handle.removeEventListener("pointercancel",stop); handle.removeEventListener("lostpointercapture",stop);
      document.body.classList.remove("resizing","resizing-row"); commit();
    };
    document.body.classList.add(axis === "x" ? "resizing" : "resizing-row");
    handle.addEventListener("pointermove",move); handle.addEventListener("pointerup",stop); handle.addEventListener("pointercancel",stop); handle.addEventListener("lostpointercapture",stop);
  });
  handle.addEventListener("keydown",event => {
    const {min,max,current} = bounds();
    const negative = axis === "x" ? "ArrowLeft" : "ArrowUp", positive = axis === "x" ? "ArrowRight" : "ArrowDown";
    if (![negative,positive,"Home","End"].includes(event.key)) return;
    event.preventDefault(); update(event.key === "Home" ? min : event.key === "End" ? max : current + (event.key === positive ? 1 : -1)*(event.shiftKey ? 40 : 10)); commit();
  });
}
