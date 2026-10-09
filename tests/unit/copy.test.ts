import { describe, expect, it, vi } from "vitest";
import { copyAnswer } from "@/lib/copy";

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.stubGlobal("ClipboardItem", undefined);
  return writeText;
}

describe("copyAnswer (texte simple)", () => {
  it("copie listes, tableaux et lien vers la page citee", async () => {
    const writeText = stubClipboard();
    await copyAnswer("**Taux** :\n- 2023 : 22,3 %\n- 2022 : 21,0 %\n\n| Année | Taux |\n|---|---|\n| 2023 | 22,3 % |", [
      {
        document_id: "x",
        document_title: "ENES",
        url: "https://www.ansd.sn/a.pdf",
        quote: "",
        page_start: 12,
        page_end: 12,
        verified: true,
      },
    ]);
    expect(writeText).toHaveBeenCalledWith(
      "Taux :\n\n• 2023 : 22,3 %\n• 2022 : 21,0 %\n\nAnnée\tTaux\n2023\t22,3 %\n\nSource : https://www.ansd.sn/a.pdf#page=12"
    );
  });

  it("numerote les sources citees dans le texte (guide, explication)", async () => {
    const writeText = stubClipboard();
    await copyAnswer("1. Consultez les Repères[[1]].", [], [
      { n: 1, title: "Repères statistiques", page: null, url: "https://www.ansd.sn/r.pdf" },
    ]);
    expect(writeText).toHaveBeenCalledWith(
      "1. Consultez les Repères [1].\n\nSources :\n[1] Repères statistiques : https://www.ansd.sn/r.pdf"
    );
  });
});
