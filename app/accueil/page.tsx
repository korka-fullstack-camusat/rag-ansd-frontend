"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Copy, Info, Loader2, Mic, Pause, PenLine, RotateCcw, Volume2 } from "lucide-react";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { Composer } from "@/components/chat/Composer";
import { CitationCard } from "@/components/chat/CitationCard";
import { TracePanel } from "@/components/chat/TracePanel";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { HeroTitle } from "@/components/chat/HeroTitle";
import { RichText } from "@/components/chat/RichText";
import { cn } from "@/lib/utils";
import { copyAnswer } from "@/lib/copy";
import { SessionSidebar } from "@/components/chat/SessionSidebar";
import { VoiceButton } from "@/components/chat/VoiceButton";
import { LANG_TO_API, type Lang } from "@/lib/languages";
import {
  ApiError,
  askQuestion,
  explainAnswer,
  fetchSources,
  trackEvent,
  sourcesOf,
  suggestTitle,
  type HistoryTurn,
  GENERIC_ERROR_MESSAGE,
  type Citation,
  type Language,
  type QueryResponse,
  type SourceDocument,
} from "@/lib/api";
import {
  captureVoice,
  isVoiceInputAvailable,
  speakText,
  VOICE_INPUT_UNAVAILABLE_MESSAGE,
  type CaptureController,
  type SpeechController,
  type VoiceLanguage,
} from "@/lib/voice";
import { loadSessions, quickTitle, saveSessions, type ChatMode, type ChatSession, type Turn } from "@/lib/sessions";

/** Titre provisoire d'une discussion lancee au micro, remplace par la
 * transcription des qu'elle arrive. */
const VOICE_TITLE = "Question vocale";

export default function AccueilPage() {
  const [lang, setLang] = useState<Lang>("FR");
  const [input, setInput] = useState("");
  // Discussions (voir lib/sessions.ts) : enregistrees dans le navigateur a
  // chaque changement, rechargees au montage. `activeId === null` = accueil
  // vide (nouvelle discussion), la session n'est creee qu'a la 1re question.
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sources, setSources] = useState<SourceDocument[] | null>(null);
  const [trace, setTrace] = useState<{ citation: Citation } | null>(null);
  const [speaking, setSpeaking] = useState<{ turnId: string; status: "loading" | "playing" | "paused" } | null>(
    null
  );
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  // Mode choisi sur l'accueil, avant la 1re question (null = pas encore
  // choisi : on s'adaptera a ce que l'utilisateur commence a faire).
  const [heroMode, setHeroMode] = useState<ChatMode | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);
  // « Voir plus » : echanges deplies, en cours de chargement, ou en erreur.
  // Le texte detaille lui-meme est stocke dans l'echange (turn.details).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailsLoading, setDetailsLoading] = useState<Set<string>>(new Set());
  const [detailsError, setDetailsError] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const speechControllerRef = useRef<SpeechController | null>(null);
  const captureControllerRef = useRef<CaptureController | null>(null);

  useEffect(() => {
    // Sert uniquement a enrichir les cartes de citation (editeur, date) ;
    // en cas d'echec elles s'affichent simplement sans ces details.
    fetchSources()
      .then(setSources)
      .catch(() => setSources([]));
  }, []);

  useEffect(() => {
    const stored = loadSessions();
    setSessions(stored.sessions);
    setActiveId(stored.activeId);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveSessions(sessions, activeId);
  }, [sessions, activeId, hydrated]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;
  const turns = activeSession?.turns ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const isBusy =
    listening || turns.some((t) => t.status === "loading" || t.status === "recording" || t.status === "transcribing");

  /** Met a jour un echange d'une session donnee — pas forcement la session
   * affichee : une reponse qui arrive apres un changement de discussion
   * atterrit bien dans celle ou la question a ete posee. */
  function patchTurn(sessionId: string, turnId: string, patch: Partial<Turn>) {
    setSessions((all) =>
      all.map((s) =>
        s.id !== sessionId
          ? s
          : { ...s, updatedAt: Date.now(), turns: s.turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t)) }
      )
    );
  }

  /** Remplace le titre provisoire d'une discussion par le titre court du
   * backend (1 a 3 mots). En cas d'echec, le titre provisoire reste. */
  function refineTitle(sessionId: string, question: string) {
    suggestTitle(question, { sessionId })
      .then((title) =>
        setSessions((all) => all.map((s) => (s.id === sessionId && !s.renamed ? { ...s, title } : s)))
      )
      .catch(() => {});
  }

  /** Ajoute un echange a la discussion affichee, ou cree la discussion si
   * l'on est sur l'accueil vide. Renvoie l'id de la session concernee. */
  function startTurn(turn: Turn): string {
    const now = Date.now();
    if (activeSession) {
      const sessionId = activeSession.id;
      setSessions((all) =>
        all.map((s) => (s.id === sessionId ? { ...s, updatedAt: now, turns: [...s.turns, turn] } : s))
      );
      return sessionId;
    }
    const sessionId = crypto.randomUUID();
    const session: ChatSession = {
      id: sessionId,
      title: turn.question ? quickTitle(turn.question) : VOICE_TITLE,
      createdAt: now,
      updatedAt: now,
      mode: turn.origin ?? "text",
      turns: [turn],
    };
    setSessions((all) => [session, ...all]);
    setActiveId(sessionId);
    if (turn.question) refineTitle(sessionId, turn.question);
    return sessionId;
  }

  /** Vrai si tous les echanges precedents de la discussion etaient de la
   * conversation courante (« Bonjour ») — le titre doit alors etre refait. */
  function isFirstRealQuestion(sessionId: string, turnId: string): boolean {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return false;
    const before = session.turns.filter((t) => t.id !== turnId);
    return before.length > 0 && before.every((t) => t.response?.kind === "chat");
  }

  /** Deux derniers echanges de la discussion (avec leurs sources) :
   * permet les questions de suite (« donne-moi les chiffres », « et en 2024 ? »). */
  function historyFor(sessionId: string, turnId: string): HistoryTurn[] {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return [];
    // Echanges qui PRECEDENT celui-ci (une question relancee garde son contexte d'origine).
    const index = session.turns.findIndex((t) => t.id === turnId);
    const before = index >= 0 ? session.turns.slice(0, index) : session.turns;
    // Echanges sans donnees inclus : apres « et pour 2026 ? » (sans donnees), « et 2025 ? »
    // doit garder le meme sujet. La conversation courante (« Bonjour ») est ignoree.
    return before
      .filter((t) => t.status === "done" && t.response && t.response.kind !== "chat")
      .slice(-2)
      // Question telle que comprise par le backend (deja autonome) : une suite de
      // demandes de forme (« en liste » puis « en tableau ») garde le bon sujet.
      .map((t) => ({
        question: t.response!.standalone_question ?? t.question,
        answer: t.response!.answer,
        sources: sourcesOf(t.response!),
      }));
  }

  /** `origin` : une question posee a voix haute recoit une reponse lue
   * automatiquement ; une question ecrite, une reponse ecrite (avec le
   * bouton « Écouter »). */
  async function runQuery(
    sessionId: string,
    turnId: string,
    question: string,
    origin: ChatMode = "text",
    regenerate = false
  ) {
    try {
      const response = await askQuestion(
        question,
        LANG_TO_API[lang],
        { sessionId, mode: origin, regenerate },
        historyFor(sessionId, turnId)
      );
      patchTurn(sessionId, turnId, { status: "done", response });
      // Discussion ouverte par « Bonjour » : le titre vient de la premiere vraie question.
      if (response.kind !== "chat" && isFirstRealQuestion(sessionId, turnId)) {
        setSessions((all) =>
          all.map((s) => (s.id === sessionId && !s.renamed ? { ...s, title: quickTitle(question) } : s))
        );
        refineTitle(sessionId, question);
      }
      if (origin === "voice") void handleListen(turnId, response.answer, response.language as VoiceLanguage);
      if (response.answered) void loadDetails(sessionId, turnId, question, response);
    } catch (err) {
      patchTurn(sessionId, turnId, {
        status: "error",
        error: err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE,
      });
    }
  }

  async function handleAsk(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isBusy) return;
    const turnId = crypto.randomUUID();
    const sessionId = startTurn({ id: turnId, question: trimmed, status: "loading", origin: "text" });
    setInput("");
    void runQuery(sessionId, turnId, trimmed, "text");
  }

  /** Prepare l'explication detaillee (« Voir plus ») en arriere-plan, des
   * que la reponse courte est arrivee : au clic, elle est le plus souvent
   * deja la, sans attente. Le resultat est stocke dans l'echange. */
  async function loadDetails(sessionId: string, turnId: string, question: string, response: QueryResponse) {
    setDetailsLoading((set) => new Set(set).add(turnId));
    setDetailsError(({ [turnId]: _old, ...rest }) => rest);
    try {
      // Question reformulee (questions de suite) et sources de la reponse : l'explication
      // porte sur la meme chose et s'appuie sur les memes documents.
      const details = await explainAnswer(
        response.standalone_question ?? question,
        response.answer,
        response.language as Language,
        { sessionId },
        sourcesOf(response)
      );
      patchTurn(sessionId, turnId, { details });
    } catch (err) {
      setDetailsError((e) => ({ ...e, [turnId]: err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE }));
    } finally {
      setDetailsLoading((set) => {
        const next = new Set(set);
        next.delete(turnId);
        return next;
      });
    }
  }

  /** « Voir plus » / « Voir moins » : deplie tout de suite (le texte, ou un
   * squelette s'il est encore en preparation) ; relance la preparation si
   * elle n'a pas eu lieu (ancienne discussion) ou a echoue. */
  function handleToggleDetails(turn: Turn) {
    if (!activeSession || !turn.response) return;
    const turnId = turn.id;
    const open = !expanded.has(turnId);
    setExpanded((set) => {
      const next = new Set(set);
      if (open) next.add(turnId);
      else next.delete(turnId);
      return next;
    });
    if (open) trackEvent("details_open", { sessionId: activeSession.id });
    if (open && !turn.details && !detailsLoading.has(turnId)) {
      void loadDetails(activeSession.id, turnId, turn.question, turn.response);
    }
  }

  /** Repose une question restee sans reponse (erreur, ou page quittee
   * pendant l'attente). */
  function handleRetry(turn: Turn) {
    if (!activeSession || isBusy || !turn.question) return;
    patchTurn(activeSession.id, turn.id, { status: "loading", error: undefined, interrupted: false });
    void runQuery(activeSession.id, turn.id, turn.question, turn.origin ?? "text");
  }

  /** « Relancer » : repose la meme question pour obtenir une nouvelle reponse
   * (le backend ignore alors son cache), au meme endroit de la discussion. */
  function handleRegenerate(turn: Turn) {
    if (!activeSession || isBusy || !turn.question) return;
    if (speaking?.turnId === turn.id) {
      speechControllerRef.current?.cancel();
      setSpeaking(null);
    }
    setExpanded((set) => {
      const next = new Set(set);
      next.delete(turn.id);
      return next;
    });
    patchTurn(activeSession.id, turn.id, {
      status: "loading",
      response: undefined,
      details: undefined,
      error: undefined,
      interrupted: false,
    });
    void runQuery(activeSession.id, turn.id, turn.question, turn.origin ?? "text", true);
  }

  /** Change le mode de la discussion affichee (« Écrire plutôt » / micro). */
  function setSessionMode(mode: ChatMode) {
    if (!activeSession) return;
    const sessionId = activeSession.id;
    setSessions((all) => all.map((s) => (s.id === sessionId ? { ...s, mode } : s)));
  }

  /** Choix du mode sur l'accueil. « Parler » lance directement l'ecoute. */
  function chooseHeroMode(mode: ChatMode) {
    setHeroMode(mode);
    setVoiceNotice(null);
    if (mode === "voice") void handleMicClick();
    else setTimeout(() => heroInputRef.current?.focus(), 0);
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
    if (!isVoiceInputAvailable(LANG_TO_API[lang])) {
      setVoiceNotice(VOICE_INPUT_UNAVAILABLE_MESSAGE);
      return;
    }
    setVoiceNotice(null);
    // Couper une lecture en cours : sinon le micro capterait la voix de l'assistant.
    speechControllerRef.current?.cancel();
    setSpeaking(null);
    // Commencer a parler fait passer la discussion en mode vocal.
    if (activeSession && activeSession.mode !== "voice") setSessionMode("voice");
    const id = crypto.randomUUID();
    // Discussion creee par cette question vocale : son titre provisoire
    // (VOICE_TITLE) sera remplace des que la transcription arrive.
    const createsSession = !activeSession;
    const sessionId = startTurn({ id, question: "", status: "recording", origin: "voice" });

    captureControllerRef.current = await captureVoice(LANG_TO_API[lang], {
      onStart: () => setListening(true),
      onRecorded: (blob) => {
        const url = URL.createObjectURL(blob);
        setSessions((all) =>
          all.map((s) =>
            s.id !== sessionId
              ? s
              : {
                  ...s,
                  turns: s.turns.map((turn) =>
                    turn.id === id
                      ? { ...turn, audioUrl: url, status: turn.status === "recording" ? "transcribing" : turn.status }
                      : turn
                  ),
                }
          )
        );
      },
      onPartial: (text) => patchTurn(sessionId, id, { question: text }),
      onResult: (text) => {
        patchTurn(sessionId, id, { question: text, status: "loading" });
        if (createsSession) {
          setSessions((all) =>
            all.map((s) => (s.id === sessionId && !s.renamed ? { ...s, title: quickTitle(text) } : s))
          );
          refineTitle(sessionId, text);
        }
        void runQuery(sessionId, id, text, "voice");
      },
      onError: (message) => {
        patchTurn(sessionId, id, { status: "error", error: message });
      },
      onEnd: () => setListening(false),
    });
  }

  /** Quitte la discussion affichee (sans la perdre : elle reste dans
   * l'historique, et une reponse encore en attente y arrivera quand meme). */
  function leaveConversation() {
    if (listening) captureControllerRef.current?.stop();
    speechControllerRef.current?.cancel();
    setSpeaking(null);
    setInput("");
    setTrace(null);
  }

  function handleNewChat() {
    leaveConversation();
    setActiveId(null);
    setHeroMode(null);
    setVoiceNotice(null);
  }

  function handleSelectSession(id: string) {
    if (id === activeId) return;
    leaveConversation();
    setActiveId(id);
  }

  /** Renommage depuis la barre laterale : le titre choisi est conserve
   * (le titre automatique ne le remplacera plus). */
  function handleRenameSession(id: string, title: string) {
    const clean = title.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!clean) return;
    setSessions((all) => all.map((s) => (s.id === id ? { ...s, title: clean, renamed: true } : s)));
  }

  function handleDeleteSession(id: string) {
    setSessions((all) => all.filter((s) => s.id !== id));
    if (id === activeId) handleNewChat();
  }

  function handleToggleSidebar() {
    if (window.matchMedia("(min-width: 768px)").matches) setDesktopSidebarOpen((o) => !o);
    else setMobileSidebarOpen(true);
  }

  const hasHistory = hydrated && sessions.length > 0;
  /** Aucune discussion encore : on presente l'assistant (grand accueil). */
  const firstVisit = sessions.length === 0;

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
        onNewChat={handleNewChat}
        showNewChat={turns.length > 0}
        onToggleSidebar={hasHistory ? handleToggleSidebar : undefined}
        sidebarOpen={hasHistory && desktopSidebarOpen}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        {hasHistory && (
          <SessionSidebar
            sessions={sessions}
            activeId={activeId}
            onSelect={handleSelectSession}
            onNew={handleNewChat}
            onDelete={handleDeleteSession}
            onRename={handleRenameSession}
            desktopOpen={desktopSidebarOpen}
            mobileOpen={mobileSidebarOpen}
            onMobileClose={() => setMobileSidebarOpen(false)}
          />
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!hydrated ? null : turns.length === 0 ? (
            // Defilable (et non `overflow-hidden` + `justify-center`, qui coupait le
            // haut du titre sur petit ecran) ; `my-auto` sur le contenu le garde
            // centre verticalement quand la place suffit.
            <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10">
              {/* Fond dégradé décoratif — hors scope du brief institutionnel, assumé ici */}
              {/* Dans leur propre cadre `overflow-hidden` : debordant de la zone,
                  ils l'elargissaient sinon, et la mise au point d'un champ la
                  faisait defiler horizontalement (contenu decale a gauche). */}
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-200/50 via-brand-100/40 to-transparent blur-3xl" />
                <div className="absolute -bottom-40 -right-24 h-80 w-80 rounded-full bg-brand-100/60 blur-3xl" />
              </div>

              <div className="relative z-10 my-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
                {/* Grand accueil (titre, presentation, choix du mode) : premiere
                    visite uniquement. Ensuite, une nouvelle discussion s'ouvre sur
                    un ecran epure — l'utilisateur connait deja l'assistant. */}
                {firstVisit ? (
                  <>
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

                  {/* Choix du mode de discussion. Sans choix, la zone de saisie
                      ci-dessous reste utilisable : on s'adapte a ce que
                      l'utilisateur commence (taper, ou toucher le micro). */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="grid w-full grid-cols-2 gap-3"
                    role="group"
                    aria-label="Comment voulez-vous poser votre question ?"
                  >
                    {(
                      [
                        { mode: "text", icon: PenLine, label: "Écrire", hint: "Je tape ma question" },
                        { mode: "voice", icon: Mic, label: "Parler", hint: "Je pose ma question à voix haute" },
                      ] as const
                    ).map(({ mode, icon: Icon, label, hint }) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => chooseHeroMode(mode)}
                        aria-pressed={heroMode === mode}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-4 text-center shadow-sm transition-all sm:flex-row sm:gap-3 sm:px-5 sm:text-left",
                          heroMode === mode
                            ? "border-brand-400 bg-brand-50 ring-2 ring-brand-200"
                            : "border-slate-200 bg-white/80 hover:border-brand-300 hover:bg-brand-50/50"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                            heroMode === mode ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-600"
                          )}
                        >
                          <Icon size={20} />
                        </span>
                        <span className="flex flex-col">
                          <span className="text-[15px] font-bold text-brand-900">{label}</span>
                          <span className="text-xs text-slate-500">{hint}</span>
                        </span>
                      </button>
                    ))}
                  </motion.div>
                  </>
                ) : (
                  <motion.h1
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl"
                  >
                    Que voulez-vous savoir ?
                  </motion.h1>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: firstVisit ? 0.8 : 0.1 }}
                  className="w-full"
                >
                  {heroMode === "voice" ? (
                    <VoiceButton
                      listening={listening}
                      disabled={isBusy}
                      onClick={handleMicClick}
                      onSwitchToText={() => chooseHeroMode("text")}
                      notice={voiceNotice}
                    />
                  ) : (
                    <>
                      <Composer
                        variant="hero"
                        placeholder="Posez une question…"
                        value={input}
                        onChange={setInput}
                        onSubmit={() => handleAsk(input)}
                        listening={listening}
                        onMicClick={handleMicClick}
                        disabled={isBusy}
                        inputRef={heroInputRef}
                        autoFocus={!firstVisit}
                      />
                      {voiceNotice && <p className="mt-2 text-xs text-red-600">{voiceNotice}</p>}
                    </>
                  )}
                </motion.div>
              </div>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                <div className="flex w-full flex-col gap-8 px-4 py-6 sm:px-12 sm:py-8 lg:px-24 xl:px-36 2xl:px-48">
                  {turns.map((turn) => (
                    <div key={turn.id} className="flex flex-col gap-3">
                      <div className="flex justify-end">
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex max-w-[88%] flex-col items-end gap-1.5 sm:max-w-[80%]"
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
                              {turn.question ? <span className="italic">{turn.question}</span> : "Je vous écoute…"}
                            </div>
                          ) : turn.status === "transcribing" ? (
                            <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-medium text-white shadow-glow">
                              Transcription en cours…
                            </div>
                          ) : (
                            turn.question && (
                              <div className="flex items-center gap-2">
                                <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-medium text-white shadow-glow">
                                  {turn.question}
                                </div>
                                {/* « Relancer » a droite de la question (reponse deja recue, hors « Bonjour »…) */}
                                {turn.status === "done" && turn.response?.kind !== "chat" && (
                                  <RegenerateButton onClick={() => handleRegenerate(turn)} disabled={isBusy} />
                                )}
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
                          <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                            <p>{turn.error}</p>
                            {turn.question && (
                              <button
                                type="button"
                                onClick={() => handleRetry(turn)}
                                disabled={isBusy}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
                              >
                                <RotateCcw size={13} />
                                Reposer la question
                              </button>
                            )}
                          </div>
                        )}

                        {turn.status === "done" && turn.response?.kind === "chat" && (
                          // Conversation courante (« Bonjour ! », « Avec plaisir ! ») : texte simple.
                          <p className="font-serif text-[17px] leading-[1.7] text-slate-800">{turn.response.answer}</p>
                        )}

                        {turn.status === "done" && turn.response && !turn.response.answered && turn.response.kind !== "chat" && (
                          // Donnees non couvertes par les publications indexees : un message simple, rien d'autre.
                          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[15px] leading-relaxed text-slate-600">
                            <Info size={18} className="mt-0.5 shrink-0 text-slate-400" />
                            <p>{turn.response.answer}</p>
                          </div>
                        )}

                        {turn.status === "done" && turn.response?.answered && (
                          <>
                            <RichText
                              text={turn.response.answer}
                              className="font-serif text-[17px] leading-[1.7] text-slate-800"
                            />

                            {/* Barre d'actions, juste sous la reponse */}
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleDetails(turn)}
                                aria-expanded={expanded.has(turn.id)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100"
                              >
                                {expanded.has(turn.id) ? "Voir moins" : "Voir plus"}
                                <ChevronDown
                                  size={16}
                                  className={cn("transition-transform", expanded.has(turn.id) && "rotate-180")}
                                />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (speaking?.turnId !== turn.id) trackEvent("listen", { sessionId: activeSession?.id });
                                  void handleListen(turn.id, turn.response!.answer, turn.response!.language as VoiceLanguage);
                                }}
                                aria-label="Écouter la réponse"
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700"
                              >
                                {(() => {
                                  const status = speaking?.turnId === turn.id ? speaking.status : null;
                                  if (status === "loading") return <Loader2 size={16} className="animate-spin" />;
                                  if (status === "playing") return <Pause size={16} />;
                                  return <Volume2 size={16} />;
                                })()}
                                {(() => {
                                  const status = speaking?.turnId === turn.id ? speaking.status : null;
                                  if (status === "loading") return "Préparation…";
                                  if (status === "playing") return "Pause";
                                  if (status === "paused") return "Reprendre";
                                  return "Écouter";
                                })()}
                              </button>

                              <CopyButton answer={turn.response.answer} citations={turn.response.citations} />
                            </div>

                            <AnimatePresence initial={false}>
                              {expanded.has(turn.id) && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.2, ease: "easeOut" }}
                                  className="overflow-hidden"
                                >
                                  <div className="rounded-xl border-l-[3px] border-brand-300 bg-brand-50/50 px-4 py-3 text-[15px] leading-relaxed text-slate-700">
                                    {turn.details ? (
                                      <div className="flex flex-col gap-3">
                                        <RichText text={turn.details} />
                                        <div className="flex justify-end">
                                          <CopyButton
                                            answer={turn.details}
                                            citations={turn.response.citations}
                                            label="Copier l'explication"
                                            small
                                          />
                                        </div>
                                      </div>
                                    ) : detailsError[turn.id] && !detailsLoading.has(turn.id) ? (
                                      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                                        {detailsError[turn.id]}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            activeSession &&
                                            loadDetails(activeSession.id, turn.id, turn.question, turn.response!)
                                          }
                                          className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-900"
                                        >
                                          <RotateCcw size={13} />
                                          Réessayer
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex animate-pulse flex-col gap-2.5 py-1" aria-label="Chargement des détails">
                                        <div className="h-3 w-11/12 rounded-full bg-brand-100" />
                                        <div className="h-3 w-full rounded-full bg-brand-100" />
                                        <div className="h-3 w-4/5 rounded-full bg-brand-100" />
                                        <div className="h-3 w-2/3 rounded-full bg-brand-100" />
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {turn.response.citations.length > 0 && (
                              <div className="flex flex-col gap-2">
                                {turn.response.citations.map((citation, i) => (
                                  <CitationCard
                                    key={`${citation.document_id}-${i}`}
                                    citation={citation}
                                    source={sourceById.get(citation.document_id)}
                                    onShowTrace={() => setTrace({ citation })}
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

              <div className="shrink-0 border-t border-slate-100 bg-white/80 px-4 py-3 backdrop-blur-xl sm:px-12 sm:py-4 lg:px-24 xl:px-36 2xl:px-48">
                <div className="w-full">
                  {activeSession?.mode === "voice" ? (
                    <VoiceButton
                      size="compact"
                      listening={listening}
                      disabled={isBusy}
                      onClick={handleMicClick}
                      onSwitchToText={() => setSessionMode("text")}
                      notice={voiceNotice}
                    />
                  ) : (
                    <>
                      <Composer
                        variant="footer"
                        placeholder="Posez une question…"
                        value={input}
                        onChange={setInput}
                        onSubmit={() => handleAsk(input)}
                        listening={listening}
                        onMicClick={handleMicClick}
                        disabled={isBusy}
                      />
                      {voiceNotice && <p className="mt-1.5 px-1 text-xs font-medium text-red-600">{voiceNotice}</p>}
                    </>
                  )}
                  {speechError && <p className="mt-1.5 px-1 text-xs font-medium text-red-600">{speechError}</p>}
                </div>
              </div>
            </>
          )}
        </div>

        <AnimatePresence>
          {trace && (
            <TracePanel
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

/** « Relancer » : obtenir une nouvelle reponse a la meme question (icone a
 * cote de la bulle de la question). */
function RegenerateButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Relancer la question"
      aria-label="Relancer la question pour obtenir une nouvelle réponse"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
    >
      <RotateCcw size={15} />
    </button>
  );
}

/** « Copier » : copie la reponse (ou l'explication detaillee) dans le format
 * affiche (liste, tableau…), avec le lien vers ses sources. */
function CopyButton({
  answer,
  citations,
  label = "Copier",
  small,
}: {
  answer: string;
  citations: Citation[];
  label?: string;
  small?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      await copyAnswer(answer, citations);
      setState("copied");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label === "Copier" ? "Copier la réponse" : label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors",
        small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        state === "copied"
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700"
      )}
    >
      {state === "copied" ? <Check size={small ? 14 : 16} /> : <Copy size={small ? 14 : 16} />}
      <span aria-live="polite">{state === "copied" ? "Copié" : state === "error" ? "Échec de la copie" : label}</span>
    </button>
  );
}
