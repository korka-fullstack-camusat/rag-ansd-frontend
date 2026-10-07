/**
 * Typed client for the XAM-XAM backend (../../backend). Shapes mirror
 * backend/app/schemas.py exactly.
 *
 * NEXT_PUBLIC_API_URL is inlined into the browser bundle at build time (a
 * Next.js requirement for NEXT_PUBLIC_* vars — see frontend/README.md), so
 * it must be set before `next build` runs, not just at container start.
 */

export type Language = "fr" | "wo" | "en";

export interface Citation {
  document_id: string;
  document_title: string;
  quote: string;
  page_start: number | null;
  page_end: number | null;
  /** Checked by the backend against the real, OCR'd page text — Mistral
   * itself doesn't guarantee a citation is real (unlike Claude's native
   * grounded citations). false means the model claimed a source the backend
   * could not confirm word-for-word. See backend/README.md. */
  verified: boolean;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface QueryResponse {
  question: string;
  language: string;
  answered: boolean;
  answer: string;
  citations: Citation[];
  sources_used: string[];
  model: string;
  usage: Usage;
}

export interface SourceDocument {
  id: string;
  title: string;
  publisher: string;
  publication_date: string;
  filename: string;
  description: string;
}

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

/** The only error text ever shown to a user for a failure on our end —
 * network failure, backend down, anything the backend itself couldn't name
 * either (see backend/app/messages.py, which the backend's own `detail`
 * field already carries this same generic text from). Deliberately never
 * mentions a provider, a service name, a status code, or any other
 * implementation detail. */
export const GENERIC_ERROR_MESSAGE = "Un bug est survenu. Veuillez réessayer.";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // response wasn't JSON — fall through to the generic message
  }
  return GENERIC_ERROR_MESSAGE;
}

export async function askQuestion(question: string, language: Language): Promise<QueryResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, language }),
    });
  } catch {
    throw new ApiError(GENERIC_ERROR_MESSAGE);
  }
  if (!res.ok) {
    throw new ApiError(await readErrorDetail(res), res.status);
  }
  return res.json();
}

export async function fetchSources(): Promise<SourceDocument[]> {
  const res = await fetch(`${API_BASE_URL}/api/sources`);
  if (!res.ok) {
    throw new ApiError(await readErrorDetail(res), res.status);
  }
  return res.json();
}

/**
 * Speech-to-text: sends a browser mic recording (whatever container
 * MediaRecorder produced — webm/opus in Chrome/Firefox, mp4/aac in Safari;
 * the backend transcodes it, see backend/app/audio.py) to Soynade via
 * `/api/voice/transcribe` and returns the transcript. Used by /vocal.
 */
export async function transcribeAudio(recording: Blob, language: Language = "wo"): Promise<string> {
  const form = new FormData();
  const extension = recording.type.includes("mp4") ? "mp4" : recording.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", recording, `recording.${extension}`);
  form.append("language", language);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/voice/transcribe`, { method: "POST", body: form });
  } catch {
    throw new ApiError(GENERIC_ERROR_MESSAGE);
  }
  if (!res.ok) {
    throw new ApiError(await readErrorDetail(res), res.status);
  }
  const body = await res.json();
  return body.text as string;
}

/**
 * Text-to-speech: asks Soynade (via `/api/voice/speak`) to read `text`
 * aloud in `language` and returns the audio as a playable Blob. Used by
 * /vocal to read the answer back. Soynade caps input at 500 characters —
 * the backend truncates longer text at a sentence boundary rather than
 * rejecting it, see backend/app/routers/voice.py.
 */
export async function synthesizeSpeech(text: string, language: Language = "wo"): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/voice/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
  } catch {
    throw new ApiError(GENERIC_ERROR_MESSAGE);
  }
  if (!res.ok) {
    throw new ApiError(await readErrorDetail(res), res.status);
  }
  return res.blob();
}

/** Direct link to the source PDF, served by the backend's static mount (see
 * backend/app/main.py) — opens in the browser's own PDF viewer, jumping to
 * the cited page where the viewer supports the #page= fragment. */
export function publicationUrl(filename: string, page?: number | null): string {
  const base = `${API_BASE_URL}/files/${encodeURIComponent(filename)}`;
  return page ? `${base}#page=${page}` : base;
}
