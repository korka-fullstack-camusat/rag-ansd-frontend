import type { Language } from "./api";

/** Langues proposees dans l'interface, dans l'ordre d'affichage du menu. */
export type Lang = "FR" | "WO" | "EN" | "FF" | "SRR" | "DYO";

export const LANGS: Lang[] = ["FR", "WO", "EN", "FF", "SRR", "DYO"];

/** Nom affiche dans le selecteur. */
export const LANG_LABELS: Record<Lang, string> = {
  FR: "Français",
  WO: "Wolof",
  EN: "English",
  FF: "Pulaar",
  SRR: "Sérère",
  DYO: "Diola",
};

/** Code envoye au backend (ISO 639 : ff = pulaar/peul, srr = sereer, dyo = jola-fonyi). */
export const LANG_TO_API: Record<Lang, Language> = {
  FR: "fr",
  WO: "wo",
  EN: "en",
  FF: "ff",
  SRR: "srr",
  DYO: "dyo",
};
