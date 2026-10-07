"use client";

import { motion } from "motion/react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Purely presentational — mic capture itself is owned by the parent page
 * (see app/accueil/page.tsx's handleMicClick) rather than by this
 * component, because pressing the mic must survive the hero → conversation
 * layout swap: the hero instance of Composer unmounts the moment the first
 * turn appears (mid-recording, by design — see the page for why), and a
 * capture state living inside Composer would be lost at exactly that
 * moment. The footer instance that mounts right after reflects the same
 * `listening` prop from the parent, so the mic button stays in sync.
 */
export function Composer({
  variant,
  placeholder,
  value,
  onChange,
  onSubmit,
  listening,
  onMicClick,
  disabled = false,
  autoFocus = false,
}: {
  variant: "hero" | "footer";
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  listening: boolean;
  onMicClick: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const isHero = variant === "hero";

  function submit() {
    if (!disabled && value.trim()) onSubmit();
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      {/* Mic errors (permission denied, transcription failure…) surface as
          the affected chat turn's own error bubble instead of a banner
          here — see handleMicClick in app/accueil/page.tsx. */}
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-xl transition-shadow focus-within:border-brand-300 focus-within:shadow-glow",
          isHero ? "p-2.5 pl-5" : "p-1.5 pl-4"
        )}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={listening ? "Je vous écoute…" : placeholder}
          aria-label={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          className={cn(
            "min-w-0 flex-1 bg-transparent font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:opacity-60",
            isHero ? "text-base" : "text-sm"
          )}
        />

        <button
          type="button"
          aria-label={listening ? "Arrêter la dictée" : "Dicter la question au microphone"}
          aria-pressed={listening}
          onClick={onMicClick}
          disabled={disabled && !listening}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40",
            isHero ? "h-11 w-11" : "h-9 w-9",
            listening
              ? "animate-pulse border-red-300 bg-red-50 text-red-600"
              : "border-slate-200 bg-white text-slate-500 hover:border-brand-300 hover:text-brand-600"
          )}
        >
          {listening ? <Square size={15} /> : <Mic size={17} />}
        </button>

        <motion.button
          type="button"
          aria-label="Envoyer la question"
          disabled={disabled || !value.trim()}
          whileHover={disabled || !value.trim() ? undefined : { scale: 1.05 }}
          whileTap={disabled || !value.trim() ? undefined : { scale: 0.95 }}
          onClick={submit}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow transition-opacity disabled:opacity-40 disabled:shadow-none",
            isHero ? "h-11 gap-1.5 px-4 text-sm font-semibold" : "h-9 w-9"
          )}
        >
          {isHero && <span>Interroger</span>}
          <ArrowUp size={isHero ? 16 : 17} strokeWidth={2.5} />
        </motion.button>
      </div>
    </div>
  );
}
