/**
 * Shared voice I/O for both voice surfaces in the product: /accueil's
 * mic (components/chat/Composer.tsx) and /vocal's hands-free voice mode
 * (app/vocal/page.tsx).
 *
 * One code path for all three languages: record from the mic, upload the
 * clip to this backend, which picks the provider server-side (see
 * backend/app/routers/voice.py) — Soynade for wolof, Mistral's Voxtral
 * models for French/English. An earlier version of this file ran French/
 * English through the browser's own Web Speech API instead; that's gone
 * now (robotic voice, Firefox has no SpeechRecognition at all, Safari's
 * support is inconsistent, and it sent audio to Google's servers) in favor
 * of one backend-mediated path that works identically everywhere and lets
 * the UI replay the user's own recording (`onRecorded`) while the
 * transcript/answer are still pending.
 */

import { ApiError, GENERIC_ERROR_MESSAGE, synthesizeSpeech, transcribeAudio, type Language } from "./api";

export type VoiceLanguage = Language;

// ---------------------------------------------------------------- capture

export interface CaptureController {
  stop: () => void;
}

export interface CaptureHandlers {
  onStart?: () => void;
  /** Fires as soon as the raw recording stops, before transcription
   * finishes — lets the UI show a playable "your recording" bubble right
   * away instead of waiting on the transcribe round-trip. */
  onRecorded?: (blob: Blob) => void;
  onResult: (text: string) => void;
  onError: (message: string) => void;
  /** Always fires last, on success or failure — the right place to reset a
   * "listening" UI state back to idle regardless of outcome. */
  onEnd: () => void;
}

export function isVoiceCaptureSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) =>
    MediaRecorder.isTypeSupported(type)
  );
}

/** Starts recording from the mic; resolves once recording has actually
 * started (or failed to — including waiting on the permission prompt). */
export async function captureVoice(
  language: VoiceLanguage,
  handlers: CaptureHandlers
): Promise<CaptureController | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    handlers.onError("Le micro n'est pas accessible depuis ce navigateur.");
    handlers.onEnd();
    return null;
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    handlers.onError(
      "Accès au micro refusé. Autorisez le micro dans les réglages du navigateur pour utiliser la dictée vocale."
    );
    handlers.onEnd();
    return null;
  }

  const mimeType = pickRecorderMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
    if (blob.size === 0) {
      handlers.onError("Aucun son enregistré — réessayez.");
      handlers.onEnd();
      return;
    }
    handlers.onRecorded?.(blob);
    void (async () => {
      try {
        const text = await transcribeAudio(blob, language);
        if (!text.trim()) {
          handlers.onError("Aucune parole détectée — parlez plus près du micro et réessayez.");
        } else {
          handlers.onResult(text.trim());
        }
      } catch (err) {
        handlers.onError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
      } finally {
        handlers.onEnd();
      }
    })();
  };
  recorder.start();
  handlers.onStart?.();
  return { stop: () => recorder.stop() };
}

// ------------------------------------------------------------------ speak

export interface SpeechController {
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

export interface SpeakHandlers {
  onStart?: () => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

/**
 * Reads `text` aloud via the backend — wolof through Soynade, French/
 * English through Mistral's Voxtral TTS (a natural preset voice — see
 * backend/app/mistral_voice.py — not the robotic browser speechSynthesis
 * this used to fall back to). `audioEl` is the shared <audio> element the
 * caller owns; this function only drives it.
 */
export async function speakText(
  text: string,
  language: VoiceLanguage,
  audioEl: HTMLAudioElement | null,
  handlers: SpeakHandlers
): Promise<SpeechController | null> {
  if (!audioEl) {
    handlers.onError(GENERIC_ERROR_MESSAGE);
    return null;
  }
  handlers.onStart?.();
  try {
    const blob = await synthesizeSpeech(text, language);
    const url = URL.createObjectURL(blob);
    audioEl.src = url;
    audioEl.onended = () => {
      URL.revokeObjectURL(url);
      handlers.onEnd();
    };
    await audioEl.play();
    return {
      pause: () => audioEl.pause(),
      resume: () => void audioEl.play(),
      cancel: () => {
        audioEl.pause();
        audioEl.removeAttribute("src");
        URL.revokeObjectURL(url);
      },
    };
  } catch (err) {
    handlers.onError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    handlers.onEnd();
    return null;
  }
}
