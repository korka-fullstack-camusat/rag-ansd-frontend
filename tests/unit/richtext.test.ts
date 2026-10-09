import { describe, expect, it } from "vitest";
import { detailSourceHref, parse } from "@/components/chat/RichText";

describe("parse (affichage du texte du modele)", () => {
  it("reconnait paragraphes, listes, titres et tableaux", () => {
    const text = [
      "### Résumé",
      "Le taux est de **22,3 %**.",
      "Suite du paragraphe.",
      "",
      "- premier point",
      "- second point",
      "1. étape un",
      "2. étape deux",
      "| Année | Taux |",
      "|---|---|",
      "| 2023 | 22,3 % |",
    ].join("\n");
    expect(parse(text)).toEqual([
      { kind: "h", text: "Résumé" },
      { kind: "p", lines: ["Le taux est de **22,3 %**.", "Suite du paragraphe."] },
      { kind: "ul", items: ["premier point", "second point"] },
      { kind: "ol", items: ["étape un", "étape deux"] },
      { kind: "table", rows: [["Année", "Taux"], ["2023", "22,3 %"]] },
    ]);
  });

  it("retire les renvois « [Source n - …] » du texte", () => {
    expect(parse("Le taux est de 22,3 % [Source 2 - Rapport, p.11].")).toEqual([
      { kind: "p", lines: ["Le taux est de 22,3 %."] },
    ]);
  });
});

describe("detailSourceHref", () => {
  it("ouvre le PDF a la bonne page", () => {
    expect(detailSourceHref({ n: 1, title: "R", page: 12, url: "https://www.ansd.sn/a.pdf#page=3" })).toBe(
      "https://www.ansd.sn/a.pdf#page=12"
    );
    expect(detailSourceHref({ n: 1, title: "R", page: null, url: "https://www.ansd.sn/a.pdf" })).toBe(
      "https://www.ansd.sn/a.pdf"
    );
    expect(detailSourceHref({ n: 1, title: "R", page: 2, url: null })).toBeNull();
  });
});
