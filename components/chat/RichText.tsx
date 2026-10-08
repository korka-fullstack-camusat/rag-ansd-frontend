import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Affiche le texte du modele sans laisser apparaitre la syntaxe Markdown :
 * `**gras**` devient du gras, les lignes « - … » / « 1. … » de vraies listes,
 * les titres « ### … » une ligne en gras. Les renvois du type
 * « [Source 3 - …, p.11] » sont retires du texte — les sources sont deja
 * affichees en cartes sous la reponse. Aucun HTML n'est injecte : tout est
 * construit en elements React.
 */

const SOURCE_REF = /\s*[[(]\s*Sources?\s*\d+[^\])]*[\])]/gi;
const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*#{1,6}\s+/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      ) : (
        // Marqueurs isoles restants (`*`, `__`) : on les retire simplement.
        part
          .replace(/\*\*|__/g, "")
          .replace(/(^|\s)\*(\S)/g, "$1$2")
          .replace(/(\S)\*(\s|$)/g, "$1$2")
      )
    );
}

export type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "h"; text: string }
  | { kind: "table"; rows: string[][] };

/** Decoupe le texte du modele en blocs (paragraphes, listes, titres, tableaux) —
 * partage avec la copie (lib/copy.ts) pour que le copie respecte l'affichage. */
export function parse(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(SOURCE_REF, "").split("\n")) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
    } else if (TABLE_ROW.test(line) || (last?.kind === "table" && TABLE_SEPARATOR.test(line))) {
      // Tableau Markdown (« | a | b | ») ; la ligne de separation « |---|---| » est ignoree.
      if (TABLE_SEPARATOR.test(line)) continue;
      if (last?.kind === "table") last.rows.push(tableCells(line));
      else blocks.push({ kind: "table", rows: [tableCells(line)] });
    } else if (HEADING.test(line)) {
      blocks.push({ kind: "h", text: line.replace(HEADING, "") });
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const kind = BULLET.test(line) ? "ul" : "ol";
      const item = line.replace(kind === "ul" ? BULLET : NUMBERED, "");
      if (last?.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (last?.kind === "p") {
      last.lines.push(line.trim());
    } else {
      blocks.push({ kind: "p", lines: [line.trim()] });
    }
  }
  return blocks.filter((b) => (b.kind === "p" ? b.lines.length > 0 : true));
}

export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {parse(text).map((block, i) => {
        if (block.kind === "h") {
          return (
            <p key={i} className="font-sans font-semibold text-slate-900">
              {renderInline(block.text, `h${i}`)}
            </p>
          );
        }
        if (block.kind === "table") {
          const [head, ...body] = block.rows;
          return (
            <div key={i} className="overflow-x-auto rounded-xl border border-slate-200 font-sans">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-brand-50 text-brand-900">
                  <tr>
                    {head.map((cell, j) => (
                      <th key={j} className="px-3 py-2 align-top font-semibold">
                        {renderInline(cell, `th${i}-${j}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, r) => (
                    <tr key={r} className="border-t border-slate-100">
                      {row.map((cell, j) => (
                        <td key={j} className={cn("px-3 py-2 align-top text-slate-700", j > 0 && "tabular-nums")}>
                          {renderInline(cell, `td${i}-${r}-${j}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.kind !== "p") {
          const List = block.kind;
          return (
            <List
              key={i}
              className={cn("flex flex-col gap-1.5 pl-5", block.kind === "ul" ? "list-disc" : "list-decimal")}
            >
              {block.items.map((item, j) => (
                <li key={j} className="pl-1 marker:text-brand-400">
                  {renderInline(item, `${i}-${j}`)}
                </li>
              ))}
            </List>
          );
        }
        return <p key={i}>{renderInline(block.lines.join(" "), `p${i}`)}</p>;
      })}
    </div>
  );
}
