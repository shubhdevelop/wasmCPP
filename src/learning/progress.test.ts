import { describe, expect, it } from "vitest";
import { loadProgress, saveProgress } from "./progress";
describe("learning progress storage", () => {
  it("round trips lesson completion and exercise notes", () => {
    let value = "";
    const storage = {getItem:()=>value,setItem:(_key:string,v:string)=>{value=v;}};
    const progress = {completed:new Set(["cpp/dsa-foundations/lesson/arrays"]),notes:{"cpp-binary-search":"Check empty input."}};
    expect(saveProgress(storage,progress)).toBe(true);
    expect(loadProgress(storage)).toEqual(progress);
  });
  it("handles corrupt data and denied writes without losing the current session", () => {
    expect(loadProgress({getItem:()=>"invalid"}).completed.size).toBe(0);
    expect(loadProgress({getItem:()=>'{"completed":[1,"valid"],"notes":{"x":42,"ok":"text"}}'})).toEqual({completed:new Set(["valid"]),notes:{ok:"text"}});
    expect(saveProgress({setItem:()=>{throw new Error("quota");}},{completed:new Set(),notes:{}})).toBe(false);
  });
});
