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

/**
 * Invite de l'ecran « nouvelle discussion », dans la langue choisie.
 * Pulaar, sereer et diola : a completer avec une traduction validee par des
 * locuteurs — en attendant, le texte francais est affiche (une traduction
 * approximative serait pire pour un service officiel).
 */
export const NEW_CHAT_PROMPT: Record<Lang, string | null> = {
  FR: "Que voulez-vous savoir ?",
  EN: "What would you like to know?",
  WO: "Lan nga bëgg xam ?",
  FF: null,
  SRR: null,
  DYO: null,
};

export function newChatPrompt(lang: Lang): string {
  return NEW_CHAT_PROMPT[lang] ?? (NEW_CHAT_PROMPT.FR as string);
}
