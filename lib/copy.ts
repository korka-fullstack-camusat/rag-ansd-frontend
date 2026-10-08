/**
 * Copie d'une reponse « dans le format affiche » : le presse-papiers recoit
 * une version HTML (listes, tableaux, gras conserves dans Word, Google Docs,
 * un e-mail…) et une version texte (puces « • », tableaux separes par des
 * tabulations — colles proprement dans Excel / Google Sheets, WhatsApp…).
 * Meme decoupage que l'affichage (RichText.parse).
 */

import { parse, type Block } from "@/components/chat/RichText";
import { publicationUrl, type Citation } from "./api";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineHtml(text: string): string {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*\*|__/g, "");
}

function inlinePlain(text: string): string {
  return text.replace(/\*\*|__/g, "");
}

function blockHtml(block: Block): string {
  switch (block.kind) {
    case "h":
      return `<p><strong>${inlineHtml(block.text)}</strong></p>`;
    case "ul":
    case "ol":
      return `<${block.kind}>${block.items.map((i) => `<li>${inlineHtml(i)}</li>`).join("")}</${block.kind}>`;
    case "table": {
      const [head, ...body] = block.rows;
      const cell = (tag: string, c: string) =>
        `<${tag} style="border:1px solid #cbd5e1;padding:4px 8px;text-align:left">${inlineHtml(c)}</${tag}>`;
      return (
        `<table style="border-collapse:collapse">` +
        `<thead><tr>${head.map((c) => cell("th", c)).join("")}</tr></thead>` +
        `<tbody>${body.map((r) => `<tr>${r.map((c) => cell("td", c)).join("")}</tr>`).join("")}</tbody></table>`
      );
    }
    default:
      return `<p>${inlineHtml(block.lines.join(" "))}</p>`;
  }
}

function blockPlain(block: Block): string {
  switch (block.kind) {
    case "h":
      return inlinePlain(block.text);
    case "ul":
      return block.items.map((i) => `• ${inlinePlain(i)}`).join("\n");
    case "ol":
      return block.items.map((i, n) => `${n + 1}. ${inlinePlain(i)}`).join("\n");
    case "table":
      return block.rows.map((r) => r.map(inlinePlain).join("\t")).join("\n");
    default:
      return inlinePlain(block.lines.join(" "));
  }
}

/** Lien vers chaque page citee : l'adresse officielle du PDF sur ansd.sn,
 * ouverte a la bonne page (#page=N). Reponses plus anciennes sans adresse :
 * lien de consultation du backend. Sans doublon. */
function sourceLinks(citations: Citation[]): { label: string; href: string }[] {
  const links = new Map<string, { label: string; href: string }>();
  for (const c of citations) {
    const page = c.page_start;
    const base = c.url ?? publicationUrl(c.document_id);
    const href = page ? `${base.split("#")[0]}#page=${page}` : base;
    if (!links.has(href)) {
      links.set(href, { label: page ? `${c.document_title} — page ${page}` : c.document_title, href });
    }
  }
  return [...links.values()];
}

export async function copyAnswer(answer: string, citations: Citation[] = []): Promise<void> {
  const blocks = parse(answer);
  const links = sourceLinks(citations);
  const title = links.length > 1 ? "Sources" : "Source";
  // Texte simple : l'adresse complete (rendue cliquable par WhatsApp, e-mail…).
  const plainSources = links.length
    ? links.length === 1
      ? `${title} : ${links[0].href}`
      : `${title} :\n${links.map((l) => l.href).join("\n")}`
    : "";
  // Texte mis en forme : un lien cliquable par page citee.
  const htmlSources = links.length
    ? `<p style="color:#64748b;font-size:90%">${title} : ${links
        .map((l) => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`)
        .join(" ; ")}</p>`
    : "";
  const plain = [blocks.map(blockPlain).join("\n\n"), plainSources].filter(Boolean).join("\n\n");
  const html = blocks.map(blockHtml).join("") + htmlSources;

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return;
    } catch {
      // certains navigateurs refusent le HTML : repli sur le texte seul
    }
  }
  await navigator.clipboard.writeText(plain);
}
