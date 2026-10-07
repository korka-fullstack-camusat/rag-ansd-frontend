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

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "h"; text: string };

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(SOURCE_REF, "").split("\n")) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
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
