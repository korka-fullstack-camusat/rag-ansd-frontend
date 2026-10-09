import { describe, expect, it } from "vitest";
import { LANG_TO_API, loadPreferredLang, newChatPrompt, savePreferredLang, welcome } from "@/lib/languages";

describe("langues", () => {
  it("invite de nouvelle discussion, avec repli sur le francais", () => {
    expect(newChatPrompt("EN")).toBe("What would you like to know?");
    expect(newChatPrompt("FF")).toBe(newChatPrompt("FR"));
    expect(welcome("DYO")).toBe(welcome("FR"));
  });

  it("codes envoyes au backend", () => {
    expect(LANG_TO_API).toMatchObject({ FR: "fr", WO: "wo", EN: "en" });
  });

  it("memorise la langue choisie et ignore une valeur inconnue", () => {
    expect(loadPreferredLang()).toBeNull();
    savePreferredLang("WO");
    expect(loadPreferredLang()).toBe("WO");
    localStorage.setItem("ansd-rag:lang", "XX");
    expect(loadPreferredLang()).toBeNull();
  });
});
