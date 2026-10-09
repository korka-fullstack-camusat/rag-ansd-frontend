import { describe, expect, it, vi } from "vitest";
import {
  API_BASE_URL,
  ApiError,
  GENERIC_ERROR_MESSAGE,
  askQuestion,
  askQuestionStream,
  publicationUrl,
  sourcesOf,
  stripStreamMarkers,
  type QueryResponse,
} from "@/lib/api";

const RESPONSE: QueryResponse = {
  question: "Taux ?",
  kind: "answer",
  language: "fr",
  answered: true,
  answer: "22,3 %",
  citations: [
    {
      document_id: "abc",
      document_title: "ENES",
      url: "https://www.ansd.sn/a.pdf",
      quote: "…",
      page_start: 12,
      page_end: 12,
      verified: true,
    },
  ],
  sources_used: ["abc"],
  model: "m",
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
} as QueryResponse;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Reponse en flux, decoupee en morceaux arbitraires (comme sur le reseau). */
function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

describe("askQuestion", () => {
  it("envoie la question, la langue, l'historique et les identifiants anonymes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(RESPONSE));
    vi.stubGlobal("fetch", fetchMock);
    const history = [{ question: "Q", answer: "A", sources: [] }];
    await expect(askQuestion("Taux ?", "fr", { sessionId: "s1", regenerate: true }, history)).resolves.toEqual(RESPONSE);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/query`);
    expect(JSON.parse(init.body)).toEqual({ question: "Taux ?", language: "fr", mode: "text", history, regenerate: true });
    expect(init.headers["X-Session-Id"]).toBe("s1");
    expect(init.headers["X-Client-Id"]).toMatch(/[0-9a-f-]{36}/);
  });

  it("affiche le message du backend en cas de refus (ex. trop de questions)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "Trop de questions." }, 429)));
    await expect(askQuestion("Q", "fr")).rejects.toMatchObject({ message: "Trop de questions.", status: 429 });
  });

  it("message generique si le serveur est injoignable ou ne repond pas en JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(askQuestion("Q", "fr")).rejects.toEqual(new ApiError(GENERIC_ERROR_MESSAGE));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 500 })));
    await expect(askQuestion("Q", "fr")).rejects.toMatchObject({ message: GENERIC_ERROR_MESSAGE, status: 500 });
  });
});

describe("askQuestionStream", () => {
  it("transmet le texte au fil de l'eau puis renvoie la reponse finale", async () => {
    const lines = [
      { type: "status", text: "search" },
      { type: "delta", text: "Le taux " },
      { type: "reset" },
      { type: "delta", text: "Le taux est de 22,3 %" },
      { type: "done", response: RESPONSE },
    ].map((e) => JSON.stringify(e) + "\n");
    const raw = lines.join("");
    // Coupe au milieu des lignes JSON : le client doit les recoller.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([raw.slice(0, 25), raw.slice(25, 90), raw.slice(90)])));
    const texts: string[] = [];
    const statuses: string[] = [];
    const response = await askQuestionStream("Taux ?", "fr", undefined, undefined, {
      onText: (t) => texts.push(t),
      onStatus: (s) => statuses.push(s),
    });
    expect(response).toEqual(RESPONSE);
    expect(statuses).toEqual(["search"]);
    expect(texts).toEqual(["Le taux ", "", "Le taux est de 22,3 %"]);
  });

  it("erreur annoncee dans le flux", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([JSON.stringify({ type: "error", detail: "Oups" }) + "\n"])));
    await expect(askQuestionStream("Q", "fr", undefined, undefined)).rejects.toMatchObject({ message: "Oups" });
  });

  it("flux interrompu sans reponse finale : message generique", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse([JSON.stringify({ type: "delta", text: "a" }) + "\n"])));
    await expect(askQuestionStream("Q", "fr", undefined, undefined)).rejects.toMatchObject({ message: GENERIC_ERROR_MESSAGE });
  });

  it("ancien backend sans flux : repli sur /api/query", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(jsonResponse(RESPONSE));
    vi.stubGlobal("fetch", fetchMock);
    await expect(askQuestionStream("Q", "fr", undefined, undefined)).resolves.toEqual(RESPONSE);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE_URL}/api/query`);
  });
});

describe("utilitaires", () => {
  it("stripStreamMarkers retire les references, meme coupees en fin de morceau", () => {
    expect(stripStreamMarkers("Le taux est de 22,3 % [1].")).toBe("Le taux est de 22,3 %.");
    expect(stripStreamMarkers("Le taux [Source 2, 3] baisse")).toBe("Le taux baisse");
    expect(stripStreamMarkers("Le taux est de 22,3 % [1")).toBe("Le taux est de 22,3 %");
  });

  it("publicationUrl et sourcesOf", () => {
    expect(publicationUrl("a b", 3)).toBe(`${API_BASE_URL}/files/a%20b#page=3`);
    expect(publicationUrl("id")).toBe(`${API_BASE_URL}/files/id`);
    expect(sourcesOf(RESPONSE)).toEqual([{ title: "ENES", page: 12 }]);
  });
});
