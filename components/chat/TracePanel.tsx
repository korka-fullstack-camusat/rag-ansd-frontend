"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, ExternalLink, ShieldCheck, ShieldQuestion, X } from "lucide-react";
import { publicationUrl, type Citation, type SourceDocument } from "@/lib/api";

function pageLabel(citation: Citation): string {
  if (citation.page_start == null) return "—";
  if (citation.page_end == null || citation.page_end === citation.page_start) {
    return `Page ${citation.page_start}`;
  }
  return `Pages ${citation.page_start}–${citation.page_end}`;
}

function formattedCitation(citation: Citation, source: SourceDocument | undefined): string {
  const parts = [`« ${citation.quote} »`, citation.document_title];
  if (source?.publisher) parts.push(source.publisher);
  if (source?.publication_date) parts.push(source.publication_date);
  parts.push(pageLabel(citation));
  return parts.join(" — ");
}

/**
 * Panneau de traçabilité — champs tous dérivés de la vraie réponse API
 * (pas de "valeur brute avant arrondi" / "cellule en base" fictives : voir
 * backend/README.md pour pourquoi ce backend citation-PDF ne peut pas les
 * fournir honnêtement).
 */
export function TracePanel({
  question,
  citation,
  source,
  onClose,
}: {
  question: string;
  citation: Citation;
  source: SourceDocument | undefined;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formattedCitation(citation, source));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — nothing to fall back to silently
    }
  }

  const rows = [
    { label: "Question", value: question },
    { label: "Publication", value: citation.document_title },
    { label: "Éditeur", value: source?.publisher ?? "Non communiqué par l'API" },
    { label: "Date de publication", value: source?.publication_date ?? "Non communiqué par l'API" },
    { label: "Page", value: pageLabel(citation) },
  ];

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 32, opacity: 0 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
        aria-label="Traçabilité de la citation"
        className="flex h-full w-full max-w-sm shrink-0 flex-col border-l border-slate-200 bg-white/85 backdrop-blur-xl"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
          <span className="text-sm font-bold text-brand-900">Traçabilité de la citation</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le panneau"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div
            className={
              citation.verified
                ? "flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50 p-3.5"
                : "flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5"
            }
          >
            {citation.verified ? (
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-600" />
            ) : (
              <ShieldQuestion size={16} className="mt-0.5 shrink-0 text-amber-500" />
            )}
            <p className="text-xs leading-relaxed text-slate-700">
              {citation.verified
                ? "Cette citation a été retrouvée mot pour mot dans le texte extrait de la page indiquée."
                : "Cette citation n'a pas pu être retrouvée automatiquement dans le texte extrait de cette page — à vérifier manuellement avant diffusion."}
            </p>
          </div>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white/60">
            {rows.map((row) => (
              <div key={row.label} className="px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{row.label}</p>
                <p className="mt-0.5 text-sm text-slate-800">{row.value}</p>
              </div>
            ))}
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Citation exacte</p>
              <p className="mt-0.5 font-serif text-sm leading-relaxed text-slate-800">
                &laquo; {citation.quote} &raquo;
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 space-y-2 border-t border-slate-200 p-4">
          {source && (
            <a
              href={publicationUrl(source.filename, citation.page_start)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.01]"
            >
              <ExternalLink size={15} />
              Consulter la publication
            </a>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            {copied ? <Check size={15} className="text-brand-600" /> : <Copy size={15} />}
            {copied ? "Citation copiée" : "Copier la citation formatée"}
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
