"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileStack, Loader2, Pause, ShieldCheck, Volume2 } from "lucide-react";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { Composer } from "@/components/chat/Composer";
import { CitationCard } from "@/components/chat/CitationCard";
import { TracePanel } from "@/components/chat/TracePanel";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { HeroTitle } from "@/components/chat/HeroTitle";
import { LANG_TO_API, type Lang } from "@/lib/languages";
import {
  ApiError,
  askQuestion,
  fetchSources,
  GENERIC_ERROR_MESSAGE,
  type Citation,
  type QueryResponse,
  type SourceDocument,
} from "@/lib/api";
import { captureVoice, speakText, type CaptureController, type SpeechController, type VoiceLanguage } from "@/lib/voice";

const SUGGESTIONS = [
  "Quel est le taux de chômage des jeunes à Kaolack ?",
  "Comment la pauvreté a-t-elle évolué depuis 2018 ?",
  "Quelle est l'espérance de vie en 2023 ?",
  "Combien d'habitants compte le Sénégal ?",
];

// Repères chiffrés d'en-tête : chiffres de communication institutionnelle
// (RGPH-5, catalogue ANADS), pas des réponses RAG — pas d'endpoint pour
// ceux-ci, contrairement au bloc de périmètre juste à côté.
const STATS = [
  { value: "18 126 390", label: "habitants (RGPH-5, 2023)" },
  { value: "107", label: "opérations archivées (ANADS)" },
  { value: "62,9 %", label: "savent lire et écrire" },
];


type TurnStatus = "recording" | "transcribing" | "loading" | "done" | "error";

interface Turn {
  id: string;
  /** Transcript (or typed text) once known — empty while still "recording". */
  question: string;
  status: TurnStatus;
  /** Playable clip of the user's own voice, set as soon as recording stops
   * — shown immediately, before the transcript/answer exist. Only present
   * for mic-originated turns. */
  audioUrl?: string;
  response?: QueryResponse;
  error?: string;
}

export default function AccueilPage() {
  const [lang, setLang] = useState<Lang>("FR");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sources, setSources] = useState<SourceDocument[] | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [trace, setTrace] = useState<{ question: string; citation: Citation } | null>(null);
  const [speaking, setSpeaking] = useState<{ turnId: string; status: "loading" | "playing" | "paused" } | null>(
    null
  );
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const speechControllerRef = useRef<SpeechController | null>(null);
  const captureControllerRef = useRef<CaptureController | null>(null);

  useEffect(() => {
    fetchSources()
      .then(setSources)
      .catch((err) =>
        setSourcesError(err instanceof ApiError ? err.message : "Périmètre des sources indisponible.")
      );
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const isBusy = turns.some((t) => t.status === "loading" || t.status === "recording" || t.status === "transcribing");

  async function runQuery(id: string, question: string) {
    try {
      const response = await askQuestion(question, LANG_TO_API[lang]);
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, status: "done", response } : turn)));
    } catch (err) {
      setTurns((t) =>
        t.map((turn) =>
          turn.id === id
            ? {
                ...turn,
                status: "error",
                error: err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE,
              }
            : turn
        )
      );
    }
  }

  async function handleAsk(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isBusy) return;
    const id = crypto.randomUUID();
    setTurns((t) => [...t, { id, question: trimmed, status: "loading" }]);
    setInput("");
    void runQuery(id, trimmed);
  }

  /** Pressing the mic drops straight into the conversation view — a
   * "recording" turn is added immediately (flipping `turns.length` from 0
   * to 1 is exactly what already switches the layout below from the hero
   * to the chat log, so no separate transition logic is needed) — as if a
   * question had already been started, before a word is transcribed. Once
   * recording stops, the user's own clip becomes playable in that same
   * bubble (`onRecorded`) while transcription — then the RAG answer — are
   * still in flight, and the turn auto-asks the moment a transcript is
   * back (no manual "send" step, same hands-free flow as /vocal). */
  async function handleMicClick() {
    if (listening) {
      captureControllerRef.current?.stop();
      return;
    }
    if (isBusy) return;
    const id = crypto.randomUUID();
    setTurns((t) => [...t, { id, question: "", status: "recording" }]);

    captureControllerRef.current = await captureVoice(LANG_TO_API[lang], {
      onStart: () => setListening(true),
      onRecorded: (blob) => {
        const url = URL.createObjectURL(blob);
        setTurns((t) =>
          t.map((turn) =>
            turn.id === id
              ? { ...turn, audioUrl: url, status: turn.status === "recording" ? "transcribing" : turn.status }
              : turn
          )
        );
      },
      onResult: (text) => {
        setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, question: text, status: "loading" } : turn)));
        void runQuery(id, text);
      },
      onError: (message) => {
        setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, status: "error", error: message } : turn)));
      },
      onEnd: () => setListening(false),
    });
  }

  function resetConversation() {
    // Blocked while a transcript or answer is genuinely in flight, but an
    // active *recording* is fine to interrupt — stopped below — since
    // that's a plausible "I changed my mind" moment, not a pending request.
    if (turns.some((t) => t.status === "transcribing" || t.status === "loading")) return;
    captureControllerRef.current?.stop();
    speechControllerRef.current?.cancel();
    setSpeaking(null);
    turns.forEach((t) => t.audioUrl && URL.revokeObjectURL(t.audioUrl));
    setTurns([]);
    setInput("");
    setTrace(null);
  }

  /** Reads an answer aloud — wolof via Soynade, fr/en via Mistral's Voxtral
   * TTS (see lib/voice.ts and backend/app/mistral_voice.py). Uses the
   * language the answer was actually given in (`turn.response.language`),
   * not whatever the header toggle currently shows, so switching languages
   * mid-conversation doesn't mis-read an earlier turn. Toggles play/pause
   * on the same turn; clicking a different turn cancels whatever was
   * playing and starts the new one. */
  async function handleListen(turnId: string, text: string, language: VoiceLanguage) {
    if (speaking?.turnId === turnId) {
      if (speaking.status === "playing") {
        speechControllerRef.current?.pause();
        setSpeaking({ turnId, status: "paused" });
      } else if (speaking.status === "paused") {
        speechControllerRef.current?.resume();
        setSpeaking({ turnId, status: "playing" });
      }
      return;
    }
    speechControllerRef.current?.cancel();
    setSpeechError(null);
    setSpeaking({ turnId, status: "loading" });
    const controller = await speakText(text, language, audioElRef.current, {
      onStart: () => setSpeaking({ turnId, status: "playing" }),
      onEnd: () => setSpeaking((s) => (s?.turnId === turnId ? null : s)),
      onError: (message) => {
        setSpeechError(message);
        setSpeaking((s) => (s?.turnId === turnId ? null : s));
      },
    });
    speechControllerRef.current = controller;
  }

  useEffect(() => {
    return () => speechControllerRef.current?.cancel();
  }, []);

  const sourceById = new Map((sources ?? []).map((s) => [s.id, s]));

  return (
    // `position: fixed` on purpose, not `h-screen`/`h-full`: this shell must
    // fill the whole viewport, header and composer never moving — only the
    // message list (its own `overflow-y-auto` region below) scrolls. An
    // earlier version sized this via a percentage-height chain (`h-full`
    // resolving against an ancestor's flex-computed height) that looked
    // right on first load but silently broke — `height: 100%` stopped
    // resolving — the moment the empty-state hero swapped for the
    // conversation view, leaving a dead gap under the composer with nothing
    // controlling where it sat. `position: fixed` has no such dependency:
    // its box is computed directly from the viewport via `inset`, not
    // from any ancestor's height at all.
    <div className="accueil-shell fixed inset-0 z-20 flex flex-col overflow-hidden bg-white">
      <ChatHeader
        lang={lang}
        onLangChange={setLang}
        onNewChat={resetConversation}
        showNewChat={turns.length > 0}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {turns.length === 0 ? (
            // Defilable (et non `overflow-hidden` + `justify-center`, qui coupait le
            // haut du titre sur petit ecran) ; `my-auto` sur le contenu le garde
            // centre verticalement quand la place suffit.
            <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10">
              {/* Fond dégradé décoratif — hors scope du brief institutionnel, assumé ici */}
              <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-200/50 via-brand-100/40 to-transparent blur-3xl" />
              <div className="pointer-events-none absolute -bottom-40 -right-24 h-80 w-80 rounded-full bg-brand-100/60 blur-3xl" />

              <div className="relative z-10 mt-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
                <HeroTitle />

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="max-w-xl font-serif text-base leading-relaxed text-slate-500 sm:text-lg"
                >
                  Posez votre question en{" "}
                  <span className="font-sans font-semibold text-brand-700">
                    français, wolof, anglais, pulaar, sérère ou diola
                  </span>
                  . Chaque chiffre vient d&rsquo;une publication officielle de l&rsquo;ANSD, citée avec sa page.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="w-full"
                >
                  <Composer
                    variant="hero"
                    placeholder="Posez une question sur la population, l'emploi, les prix, l'éducation…"
                    value={input}
                    onChange={setInput}
                    onSubmit={() => handleAsk(input)}
                    listening={listening}
                    onMicClick={handleMicClick}
                    disabled={isBusy}
                    autoFocus
                  />
                </motion.div>

                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={{ visible: { transition: { staggerChildren: 0.05, delayChildren: 0.2 } } }}
                  className="flex flex-wrap items-center justify-center gap-2"
                >
                  {SUGGESTIONS.map((question) => (
                    <motion.button
                      key={question}
                      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleAsk(question)}
                      className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-sm transition-colors hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
                    >
                      {question}
                    </motion.button>
                  ))}
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="relative z-10 mb-auto mt-12 flex w-full max-w-2xl flex-col items-center gap-3 border-t border-slate-100 pt-6"
              >
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5">
                  {STATS.map((stat) => (
                    <span key={stat.label} className="text-xs text-slate-400">
                      <span className="tabular-nums font-bold text-brand-800">{stat.value}</span>{" "}
                      {stat.label}
                    </span>
                  ))}
                </div>
                <div className="flex w-full flex-wrap items-center justify-center gap-1.5">
                  <FileStack size={13} className="text-slate-400" />
                  {sourcesError && <span className="text-xs text-slate-400">{sourcesError}</span>}
                  {!sourcesError && sources === null && (
                    <span className="text-xs text-slate-400">Chargement du périmètre…</span>
                  )}
                  {!sourcesError &&
                    sources?.map((s) => (
                      <span
                        key={s.id}
                        title={s.title}
                        className="flex min-w-0 max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 sm:max-w-[280px]"
                      >
                        <span className="truncate">{s.title}</span>
                        <span className="shrink-0 text-slate-400">— {s.publication_date.slice(0, 4)}</span>
                      </span>
                    ))}
                </div>
              </motion.div>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8">
                  {turns.map((turn) => (
                    <div key={turn.id} className="flex flex-col gap-3">
                      <div className="flex justify-end">
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex max-w-[80%] flex-col items-end gap-1.5"
                        >
                          {/* The user's own recording — playable as soon as it stops,
                              typically before the transcript (and always before the
                              answer) are back. Mic-originated turns only. */}
                          {turn.audioUrl && (
                            // eslint-disable-next-line jsx-a11y/media-has-caption -- a user's own short voice note, not media content
                            <audio
                              controls
                              src={turn.audioUrl}
                              className="h-9 w-64 max-w-full rounded-full"
                              aria-label="Votre enregistrement"
                            />
                          )}

                          {turn.status === "recording" ? (
                            <div className="flex items-center gap-2 rounded-2xl rounded-br-md bg-gradient-to-br from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-medium text-white shadow-glow">
                              <span className="relative flex h-2 w-2 shrink-0">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                              </span>
                              Je vous écoute…
                            </div>
                          ) : turn.status === "transcribing" ? (
                            <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-medium text-white shadow-glow">
                              Transcription en cours…
                            </div>
                          ) : (
                            turn.question && (
                              <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-medium text-white shadow-glow">
                                {turn.question}
                              </div>
                            )
                          )}
                        </motion.div>
                      </div>

                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08 }}
                        className="flex flex-col gap-4"
                      >
                        {turn.status === "loading" && <TypingIndicator />}

                        {turn.status === "error" && (
                          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                            {turn.error}
                          </p>
                        )}

                        {turn.status === "done" && turn.response && (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              {turn.response.citations.length > 0 &&
                                turn.response.citations.every((c) => c.verified) && (
                                  <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
                                    <ShieldCheck size={13} />
                                    Chiffres retrouvés mot pour mot dans les documents sources
                                  </div>
                                )}

                              <button
                                type="button"
                                onClick={() =>
                                  handleListen(turn.id, turn.response!.answer, turn.response!.language as VoiceLanguage)
                                }
                                className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700"
                              >
                                {(() => {
                                  const status = speaking?.turnId === turn.id ? speaking.status : null;
                                  if (status === "loading") return <Loader2 size={13} className="animate-spin" />;
                                  if (status === "playing") return <Pause size={13} />;
                                  return <Volume2 size={13} />;
                                })()}
                                {(() => {
                                  const status = speaking?.turnId === turn.id ? speaking.status : null;
                                  if (status === "loading") return "Préparation…";
                                  if (status === "playing") return "Pause";
                                  if (status === "paused") return "Reprendre";
                                  return "Écouter";
                                })()}
                              </button>
                            </div>

                            <p className="whitespace-pre-wrap font-serif text-[17px] leading-[1.7] text-slate-800">
                              {turn.response.answer}
                            </p>

                            {turn.response.citations.length > 0 && (
                              <div className="flex flex-col gap-2">
                                {turn.response.citations.map((citation, i) => (
                                  <CitationCard
                                    key={`${citation.document_id}-${i}`}
                                    citation={citation}
                                    source={sourceById.get(citation.document_id)}
                                    onShowTrace={() => setTrace({ question: turn.question, citation })}
                                  />
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </motion.div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-white/80 px-6 py-4 backdrop-blur-xl">
                <div className="mx-auto w-full max-w-5xl">
                  <Composer
                    variant="footer"
                    placeholder="Posez une autre question"
                    value={input}
                    onChange={setInput}
                    onSubmit={() => handleAsk(input)}
                    listening={listening}
                    onMicClick={handleMicClick}
                    disabled={isBusy}
                  />
                  {speechError && <p className="mt-1.5 px-1 text-xs font-medium text-red-600">{speechError}</p>}
                </div>
              </div>
            </>
          )}
        </div>

        <AnimatePresence>
          {trace && (
            <TracePanel
              question={trace.question}
              citation={trace.citation}
              source={sourceById.get(trace.citation.document_id)}
              onClose={() => setTrace(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Shared player for answer read-aloud (handleListen / lib/voice.ts) —
          every turn's own recording bubble above has its own <audio>
          element instead, since several of those can coexist on screen. */}
      <audio ref={audioElRef} hidden />
    </div>
  );
}
