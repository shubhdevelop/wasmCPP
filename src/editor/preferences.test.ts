import { describe, it, expect } from "vitest";
import { EDITOR_PREFERENCES_KEY, loadEditorPreferences } from "./preferences";
const storage = (values: Record<string,string>) => ({getItem:(key:string)=>values[key] ?? null});
describe("shared editor preferences", () => {
  it("migrates the existing C++ theme and Vim setting", () => {
    expect(loadEditorPreferences(storage({"local-cpp-lab:preferences-v1":'{"theme":"catppuccin-mocha"}',"local-cpp-lab:vim-enabled":"true"}))).toEqual({theme:"catppuccin-mocha",vim:true});
  });
  it("uses shared settings in preference to old per-lab settings", () => {
    expect(loadEditorPreferences(storage({[EDITOR_PREFERENCES_KEY]:'{"theme":"catppuccin-latte","vim":false}',"local-cpp-lab:preferences-v1":'{"theme":"catppuccin-mocha"}',"local-cpp-lab:vim-enabled":"true"}))).toEqual({theme:"catppuccin-latte",vim:false});
  });
  it("rejects invalid values and tolerates corrupt or denied storage", () => {
    expect(loadEditorPreferences(storage({[EDITOR_PREFERENCES_KEY]:'{"theme":"unknown","vim":"false"}'}))).toEqual({theme:"local",vim:false});
    expect(loadEditorPreferences(storage({[EDITOR_PREFERENCES_KEY]:'broken'}))).toEqual({theme:"local",vim:false});
    expect(loadEditorPreferences({getItem:()=>{throw new Error("denied");}})).toEqual({theme:"local",vim:false});
  });
});
