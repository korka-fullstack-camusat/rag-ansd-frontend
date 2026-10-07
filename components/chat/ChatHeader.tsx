"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { Globe2, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/components/Header";

const LANGS: Lang[] = ["FR", "WO", "EN"];

export function ChatHeader({
  lang,
  onLangChange,
  onNewChat,
  showNewChat,
}: {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onNewChat: () => void;
  showNewChat: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-900/5 bg-white/70 px-5 backdrop-blur-xl sm:px-10">
      <div className="flex items-center gap-3">
        <Image
          src="/ansd-logo.png"
          alt="ANSD — Agence Nationale de la Statistique et de la Démographie"
          width={259}
          height={194}
          priority
          className="h-11 w-auto shrink-0"
        />
        <div className="h-8 w-px shrink-0 bg-slate-200" />
        <div className="flex flex-col leading-tight">
          <span className="text-base font-extrabold text-brand-900">XAMXAM</span>
          <span className="hidden text-[11px] font-medium text-slate-500 sm:block">
            Statistiques — ANSD
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {showNewChat && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onNewChat}
            className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-brand-800 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50 sm:flex"
          >
            <MessageSquarePlus size={14} />
            Nouvelle conversation
          </motion.button>
        )}
        <Globe2 size={16} className="hidden text-slate-400 sm:block" />
        <div className="flex rounded-full border border-slate-200 bg-slate-100/70 p-1">
          {LANGS.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={lang === code}
              onClick={() => onLangChange(code)}
              className={cn(
                "relative rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
                lang === code ? "text-white" : "text-slate-500 hover:text-brand-700"
              )}
            >
              {lang === code && (
                <motion.span
                  layoutId="lang-pill"
                  transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 shadow-glow"
                />
              )}
              <span className="relative">{code}</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
