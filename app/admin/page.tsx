"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Loader2,
  LockKeyhole,
  LogOut,
  Mic,
  RefreshCw,
} from "lucide-react";
import { ColumnChart, fmt, Meter, RankedBars } from "@/components/admin/charts";
import { ApiError, GENERIC_ERROR_MESSAGE } from "@/lib/api";
import {
  fetchAdminQuestions,
  fetchAdminStats,
  loadAdminToken,
  saveAdminToken,
  type AdminStats,
  type LoggedQuestion,
  type QuestionStatus,
} from "@/lib/admin";
import { cn } from "@/lib/utils";

const PERIODS = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
  { days: 0, label: "Tout" },
];

const LANGUAGE_NAMES: Record<string, string> = {
  fr: "Français",
  wo: "Wolof",
  en: "English",
  ff: "Pulaar",
  srr: "Sérère",
  dyo: "Diola",
};

const STATUS_TABS: { value: QuestionStatus; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "answered", label: "Répondues" },
  { value: "no_data", label: "Sans données" },
  { value: "error", label: "Erreurs" },
];

const PAGE_SIZE = 20;

// Le Senegal est a UTC+0 toute l'annee : heures et jours UTC du backend = heure de Dakar.
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Dakar",
});

function seconds(ms: number | null): string {
  return ms === null ? "—" : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
}

function compact(n: number): string {
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

// ------------------------------------------------------------------ page

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setToken(loadAdminToken());
    setReady(true);
  }, []);

  function logout() {
    saveAdminToken(null);
    setToken(null);
  }

  if (!ready) return null;
  return token ? (
    <Dashboard token={token} onLogout={logout} />
  ) : (
    <Login
      onSuccess={(t) => {
        saveAdminToken(t);
        setToken(t);
      }}
    />
  );
}

// ------------------------------------------------------------------ connexion

function Login({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await fetchAdminStats(password.trim(), 7); // valide le mot de passe
      onSuccess(password.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/ansd-logo.png" alt="ANSD" width={259} height={194} className="h-12 w-auto" priority />
          <div>
            <h1 className="text-lg font-bold text-brand-900">Tableau de bord</h1>
            <p className="text-sm text-slate-500">Assistant de l&rsquo;ANSD — accès administrateur</p>
          </div>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Mot de passe administrateur
          <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-brand-400">
            <LockKeyhole size={16} className="shrink-0 text-slate-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none"
            />
          </div>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white shadow-glow transition-opacity disabled:opacity-50"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          Se connecter
        </button>
      </form>
    </main>
  );
}

// ------------------------------------------------------------------ tableau de bord

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchAdminStats(token, days));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onLogout();
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [token, days, onLogout]);

  useEffect(() => {
    void load();
  }, [load]);

  const k = stats?.kpis;
  const periodLabel = PERIODS.find((p) => p.days === days)?.label.toLowerCase();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Image src="/ansd-logo.png" alt="ANSD" width={259} height={194} className="h-9 w-auto shrink-0" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold text-brand-900 sm:text-base">Tableau de bord</p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">Utilisation de l&rsquo;assistant de l&rsquo;ANSD</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href="/accueil"
              className="hidden items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-brand-700 sm:flex"
            >
              Ouvrir l&rsquo;assistant
              <ArrowUpRight size={15} />
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        {/* Filtres : une seule ligne, au-dessus de tout ce qu'ils filtrent */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Période">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(p.days)}
                aria-pressed={days === p.days}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  days === p.days ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700"
          >
            <RefreshCw size={15} className={cn(loading && "animate-spin")} />
            Actualiser
          </button>
          {stats && (
            <p className="text-xs text-slate-400">
              Mis à jour à {new Date(stats.generated_at * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} /> {error}
          </p>
        )}

        {!stats ? (
          <div className="flex justify-center py-24">
            <Loader2 size={28} className="animate-spin text-brand-500" />
          </div>
        ) : (
          // Rechargement : on garde l'affichage precedent, attenue (pas de saut).
          <div className={cn("flex flex-col gap-6 transition-opacity", loading && "opacity-60")}>
            {k!.questions === 0 && (
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                Aucune question posée sur les {periodLabel === "tout" ? "données disponibles" : periodLabel}. Les
                indicateurs se rempliront dès que l&rsquo;assistant sera utilisé.
              </p>
            )}

            {/* Indicateurs cles */}
            <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <Card className="col-span-2 flex flex-col justify-between gap-3 lg:row-span-2">
                <p className="text-sm font-medium text-slate-500">Questions posées</p>
                <p className="text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl">{fmt.format(k!.questions)}</p>
                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 text-sm">
                  <div>
                    <p className="text-slate-500">Répondues</p>
                    <p className="text-lg font-semibold tabular-nums text-slate-900">
                      {fmt.format(k!.questions - k!.no_data)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Sans données</p>
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{fmt.format(k!.no_data)}</p>
                  </div>
                </div>
              </Card>
              <Stat label="Utilisateurs" value={fmt.format(k!.users)} hint="navigateurs distincts" />
              <Stat label="Discussions" value={fmt.format(k!.sessions)} hint={k!.sessions ? `${(k!.questions / k!.sessions).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} questions en moyenne` : undefined} />
              <Stat label="Taux de réponse" value={`${k!.answer_rate.toLocaleString("fr-FR")} %`} hint="questions couvertes par les publications">
                <Meter value={k!.answer_rate} label="Taux de réponse" />
              </Stat>
              <Stat
                label="Temps de réponse"
                value={seconds(k!.avg_latency_ms)}
                hint={`9 réponses sur 10 en moins de ${seconds(k!.p90_latency_ms)} · ${k!.cache_rate.toLocaleString("fr-FR")} % servies depuis le cache`}
              />
            </section>

            <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
              <Stat label="Questions vocales" value={`${k!.voice_share.toLocaleString("fr-FR")} %`} hint="part des questions posées à voix haute">
                <Meter value={k!.voice_share} label="Part des questions vocales" />
              </Stat>
              <Stat label="« Voir plus » ouverts" value={fmt.format(k!.details_opened)} hint={`${k!.details_rate.toLocaleString("fr-FR")} % des réponses`} />
              <Stat label="Écoutes" value={fmt.format(k!.listens)} hint="clics sur « Écouter » (hors lecture automatique)" />
              <Stat
                label="Erreurs"
                value={fmt.format(k!.errors)}
                hint={`${k!.error_rate.toLocaleString("fr-FR")} % des questions`}
                alert={k!.errors > 0}
              />
              <Stat
                className="col-span-2 lg:col-span-1"
                label="Tokens consommés"
                value={compact(k!.prompt_tokens + k!.completion_tokens)}
                hint={`Réponses uniquement (hors « Voir plus » et titres) · ${compact(k!.prompt_tokens)} en entrée, ${compact(k!.completion_tokens)} en sortie`}
              />
            </section>

            {/* Activite dans le temps */}
            <Card>
              <CardTitle title="Questions par jour" subtitle={`Sur ${periodLabel === "tout" ? "toute la période" : `les ${periodLabel}`}`} />
              <ColumnChart
                ariaLabel="Nombre de questions par jour"
                valueLabel="questions"
                height={220}
                tickEvery={Math.max(1, Math.ceil(stats.per_day.length / 8))}
                data={stats.per_day.map((d) => ({
                  key: d.date,
                  label: dateFmt.format(new Date(d.date)),
                  value: d.total,
                  tooltip: {
                    title: new Date(d.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
                    rows: [
                      { label: "Répondues", value: fmt.format(d.answered) },
                      { label: "Sans données", value: fmt.format(d.no_data) },
                    ],
                  },
                }))}
              />
              <DataTable
                summary="Voir les données jour par jour"
                headers={["Jour", "Questions", "Répondues", "Sans données"]}
                rows={[...stats.per_day].reverse().map((d) => [
                  new Date(d.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
                  fmt.format(d.total),
                  fmt.format(d.answered),
                  fmt.format(d.no_data),
                ])}
              />
            </Card>

            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardTitle title="Heures de pointe" subtitle="Questions selon l'heure de la journée (heure de Dakar)" />
                <ColumnChart
                  ariaLabel="Nombre de questions selon l'heure"
                  valueLabel="questions"
                  height={160}
                  tickEvery={3}
                  data={stats.per_hour.map((h) => ({
                    key: String(h.hour),
                    label: `${h.hour} h`,
                    value: h.total,
                    tooltip: { title: `Entre ${h.hour} h et ${h.hour + 1} h` },
                  }))}
                />
              </Card>
              <Card className="lg:col-span-2">
                <CardTitle title="Langues utilisées" />
                <RankedBars
                  rows={stats.languages.map((l) => ({
                    key: l.language,
                    label: LANGUAGE_NAMES[l.language] ?? l.language,
                    value: l.total,
                  }))}
                />
                <div className="mt-5 flex gap-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
                  {(["text", "voice"] as const).map((mode) => (
                    <span key={mode} className="flex items-center gap-1.5">
                      {mode === "text" ? <Keyboard size={15} className="text-slate-400" /> : <Mic size={15} className="text-slate-400" />}
                      {mode === "text" ? "Écrit" : "Vocal"}
                      <strong className="tabular-nums text-slate-900">
                        {fmt.format(stats.modes.find((m) => m.mode === mode)?.total ?? 0)}
                      </strong>
                    </span>
                  ))}
                </div>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardTitle title="Sujets les plus demandés" subtitle="D'après le titre donné à chaque discussion" />
                <RankedBars rows={stats.topics.map((t) => ({ key: t.topic, label: t.topic, value: t.total, suffix: "disc." }))} />
              </Card>
              <Card>
                <CardTitle title="Publications les plus citées" subtitle="Nombre de réponses s'appuyant sur chaque publication" />
                <RankedBars rows={stats.top_sources.map((s) => ({ key: s.title, label: s.title, title: s.title, value: s.total }))} />
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardTitle
                  title="Demandes sans données"
                  subtitle="Questions que les publications indexées ne couvrent pas encore — à prioriser pour enrichir le corpus"
                />
                <QuestionRanking items={stats.unanswered} empty="Toutes les questions ont trouvé une réponse." />
              </Card>
              <Card>
                <CardTitle title="Questions les plus fréquentes" />
                <QuestionRanking items={stats.top_questions} />
              </Card>
            </div>

            <QuestionLog token={token} days={days} onUnauthorized={onLogout} />
          </div>
        )}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ elements

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-slate-200 bg-white p-4 sm:p-6", className)}>{children}</section>;
}

function CardTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  alert,
  className,
  children,
}: {
  className?: string;
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
  children?: ReactNode;
}) {
  return (
    <Card className={cn("flex flex-col gap-2", className)}>
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
        {alert && <AlertTriangle size={14} className="text-amber-500" aria-label="Attention" />}
        {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-3xl">{value}</p>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

function DataTable({ summary, headers, rows }: { summary: string; headers: string[]; rows: string[][] }) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-brand-600 hover:text-brand-800">{summary}</summary>
      <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-100">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
            <tr>
              {headers.map((h, i) => (
                <th key={h} className={cn("px-3 py-2 font-semibold", i > 0 && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-t border-slate-100">
                {r.map((c, i) => (
                  <td key={i} className={cn("px-3 py-1.5 text-slate-700", i > 0 && "text-right tabular-nums")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function QuestionRanking({ items, empty = "Aucune question sur la période." }: { items: AdminStats["top_questions"]; empty?: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  return (
    <ol className="flex flex-col divide-y divide-slate-100">
      {items.map((q, i) => (
        <li key={`${q.question}-${i}`} className="flex items-start gap-3 py-2.5 text-sm">
          <span className="w-5 shrink-0 pt-px text-right text-xs font-semibold tabular-nums text-slate-400">{i + 1}</span>
          <span className="min-w-0 flex-1 text-slate-700">{q.question}</span>
          <span className="shrink-0 font-semibold tabular-nums text-slate-900">× {fmt.format(q.count)}</span>
        </li>
      ))}
    </ol>
  );
}

function QuestionLog({ token, days, onUnauthorized }: { token: string; days: number; onUnauthorized: () => void }) {
  const [status, setStatus] = useState<QuestionStatus>("all");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; items: LoggedQuestion[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setPage(0), [status, days]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAdminQuestions(token, days, status, page * PAGE_SIZE, PAGE_SIZE)
      .then((d) => !cancelled && setData(d))
      .catch((err) => err instanceof ApiError && err.status === 401 && onUnauthorized())
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, days, status, page, onUnauthorized]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <CardTitle title="Journal des questions" subtitle="Les plus récentes en premier" />
        <div className="-mt-5 flex flex-wrap gap-1.5">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setStatus(t.value)}
              aria-pressed={status === t.value}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                status === t.value ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("overflow-x-auto transition-opacity", loading && "opacity-60")}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="py-2 pr-3 font-semibold">Date</th>
              <th className="py-2 pr-3 font-semibold">Question</th>
              <th className="py-2 pr-3 font-semibold">Langue</th>
              <th className="py-2 pr-3 font-semibold">Mode</th>
              <th className="py-2 pr-3 font-semibold">Statut</th>
              <th className="py-2 text-right font-semibold">Temps</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((q, i) => (
              <tr key={`${q.ts}-${i}`} className="border-b border-slate-50 align-top">
                <td className="whitespace-nowrap py-2.5 pr-3 text-slate-500">{dateTimeFmt.format(new Date(q.ts * 1000))}</td>
                <td className="py-2.5 pr-3 text-slate-800">{q.question}</td>
                <td className="py-2.5 pr-3 text-slate-600">{LANGUAGE_NAMES[q.language] ?? q.language}</td>
                <td className="py-2.5 pr-3 text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    {q.mode === "voice" ? <Mic size={13} /> : <Keyboard size={13} />}
                    {q.mode === "voice" ? "Vocal" : "Écrit"}
                  </span>
                </td>
                <td className="py-2.5 pr-3">
                  <StatusBadge q={q} />
                </td>
                <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-slate-600">{seconds(q.latency_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Aucune question.</p>}
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            {fmt.format(page * PAGE_SIZE + 1)}–{fmt.format(Math.min(data.total, (page + 1) * PAGE_SIZE))} sur{" "}
            {fmt.format(data.total)}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Page précédente"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Page suivante"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Statut : toujours une icone/un libelle, jamais la couleur seule. */
function StatusBadge({ q }: { q: LoggedQuestion }) {
  if (q.error)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
        <AlertTriangle size={12} /> Erreur
      </span>
    );
  if (q.answered === 1)
    return <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">✓ Répondue</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">○ Sans données</span>;
}
