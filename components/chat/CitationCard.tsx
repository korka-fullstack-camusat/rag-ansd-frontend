"use client";

import { motion } from "motion/react";
import { FileText, Info } from "lucide-react";
import type { Citation, SourceDocument } from "@/lib/api";

export function CitationCard({
  citation,
  source,
  onShowTrace,
}: {
  citation: Citation;
  source: SourceDocument | undefined;
  onShowTrace: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onShowTrace}
      whileHover={{ y: -1 }}
      className="group flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white/70 p-3 text-left shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/60"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-100">
        <FileText size={15} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{citation.document_title}</p>
        <p className="tabular-nums text-xs text-slate-500">
          {source ? `${source.publisher} — publiée le ${source.publication_date} — ` : ""}
          page {citation.page_start ?? "—"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 pl-1">
        <span className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 transition-colors group-hover:border-brand-300 group-hover:bg-brand-100 sm:px-3.5">
          <Info size={15} />
          Source
        </span>
      </div>
    </motion.button>
  );
}
