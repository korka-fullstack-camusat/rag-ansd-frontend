/**
 * Parcours complet de la page de l'assistant, avec un backend simule (fetch) :
 * poser une question, recevoir la reponse en flux avec ses sources, relancer en
 * modifiant la question, recevoir un guide de recherche avec ses liens, gerer une erreur.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { QueryResponse } from "@/lib/api";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ priority: _priority, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}));

import AccueilPage from "@/app/accueil/page";

const ANSWER: QueryResponse = {
  question: "Quel est le taux de chômage en 2023 ?",
  kind: "answer",
  language: "fr",
  answered: true,
  answer: "Le taux de chômage élargi est de **22,3 %** au T4 2023.",
  citations: [
    {
      document_id: "abc",
      document_title: "Enquête nationale sur l'emploi T4 2023",
      url: "https://www.ansd.sn/enes.pdf",
      quote: "…22,3 %…",
      page_start: 12,
      page_end: 12,
      verified: true,
    },
  ],
  sources_used: ["abc"],
  model: "m",
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
} as QueryResponse;

const GUIDE: QueryResponse = {
  ...ANSWER,
  question: "Donnez-moi les étapes pour mes recherches",
  kind: "guide",
  answered: false,
  answer: "1. Définissez votre question.\n2. Consultez les Repères statistiques[[1]].",
  citations: [],
  sources_used: [],
  sources: [{ n: 1, title: "Repères statistiques, avril 2026", page: null, url: "https://www.ansd.sn/reperes.pdf" }],
};

type Handler = (body: Record<string, unknown>) => Response;

function ndjson(...events: unknown[]) {
  return new Response(events.map((e) => JSON.stringify(e) + "\n").join(""), {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Backend simule : chaque route repond selon `routes`, et les appels sont gardes. */
function mockBackend(routes: Record<string, Handler>) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
      calls.push({ path, body });
      const handler = routes[path];
      if (handler) return handler(body);
      if (path === "/api/title") return json({ title: "Chômage" });
      if (path === "/api/explain") return json({ details: "Détails.", sources: [] });
      if (path === "/api/track") return new Response(null, { status: 204 });
      return json({ detail: "route inconnue" }, 404);
    })
  );
  return calls;
}

async function askInHero(question: string) {
  const field = await screen.findByPlaceholderText("Posez une question…");
  fireEvent.change(field, { target: { value: question } });
  await act(async () => {
    fireEvent.keyDown(field, { key: "Enter" });
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe("page de l'assistant", () => {
  it("pose une question et affiche la reponse avec le lien vers la source", async () => {
    const calls = mockBackend({
      "/api/query/stream": () =>
        ndjson({ type: "status", text: "search" }, { type: "delta", text: "Le taux…" }, { type: "done", response: ANSWER }),
    });
    render(<AccueilPage />);
    await askInHero("Quel est le taux de chômage en 2023 ?");

    expect(await screen.findByText("22,3 %")).toBeTruthy(); // gras rendu, sans les asterisques
    const source = screen.getByRole("link", { name: /Enquête nationale sur l'emploi T4 2023/ });
    expect(source.getAttribute("href")).toBe("https://www.ansd.sn/enes.pdf#page=12");
    expect(screen.getByRole("button", { name: /Explication détaillée/ })).toBeTruthy();

    const query = calls.find((c) => c.path === "/api/query/stream")!;
    expect(query.body).toMatchObject({ question: "Quel est le taux de chômage en 2023 ?", language: "fr", history: [] });
    // La discussion est enregistree dans le navigateur.
    expect(localStorage.getItem("ansd-rag:sessions:v1")).toContain("Quel est le taux de chômage en 2023 ?");
  });

  it("relancer : la question revient dans le champ pour etre completee, puis remplace l'ancienne", async () => {
    const calls = mockBackend({
      "/api/query/stream": (body) => ndjson({ type: "done", response: { ...ANSWER, question: body.question } }),
    });
    render(<AccueilPage />);
    await askInHero("Quel est le taux de chômage en 2023 ?");
    await screen.findByText("22,3 %");

    fireEvent.click(screen.getByRole("button", { name: /Relancer la question/ }));
    const field = screen.getByPlaceholderText("Posez une question…") as HTMLTextAreaElement;
    expect(field.value).toBe("Quel est le taux de chômage en 2023 ?");
    expect(screen.getByText(/Complétez ou modifiez la question/)).toBeTruthy();

    fireEvent.change(field, { target: { value: "Quel est le taux de chômage des jeunes en 2023 ?" } });
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });
    await waitFor(() => expect(screen.getByText("Quel est le taux de chômage des jeunes en 2023 ?")).toBeTruthy());
    expect(screen.queryByText("Quel est le taux de chômage en 2023 ?")).toBeNull(); // remplacee, pas ajoutee
    const streams = calls.filter((c) => c.path === "/api/query/stream");
    expect(streams).toHaveLength(2);
  });

  it("affiche un guide de recherche avec un lien vers chaque publication", async () => {
    mockBackend({ "/api/query/stream": () => ndjson({ type: "done", response: GUIDE }) });
    render(<AccueilPage />);
    await askInHero("Donnez-moi les étapes pour mes recherches");

    const link = await screen.findByRole("link", { name: /Repères statistiques/ });
    expect(link.getAttribute("href")).toBe("https://www.ansd.sn/reperes.pdf");
    expect(screen.getByText("Définissez votre question.")).toBeTruthy();
    expect(screen.queryByText(/Nous n'avons pas encore de données/)).toBeNull();
  });

  it("affiche le message d'absence de donnees", async () => {
    mockBackend({
      "/api/query/stream": () =>
        ndjson({
          type: "done",
          response: { ...ANSWER, kind: "no_data", answered: false, citations: [], answer: "Nous n'avons pas encore de données sur cette demande." },
        }),
    });
    render(<AccueilPage />);
    await askInHero("Combien de girafes au Sénégal ?");
    expect(await screen.findByText("Nous n'avons pas encore de données sur cette demande.")).toBeTruthy();
  });

  it("serveur en panne : message d'erreur et possibilite de reposer la question", async () => {
    mockBackend({ "/api/query/stream": () => json({ detail: "Un bug est survenu. Veuillez réessayer." }, 502) });
    render(<AccueilPage />);
    await askInHero("Quel est le taux de chômage en 2023 ?");
    expect(await screen.findByText("Un bug est survenu. Veuillez réessayer.")).toBeTruthy();
  });

  it("restaure la discussion apres un rechargement", async () => {
    mockBackend({ "/api/query/stream": () => ndjson({ type: "done", response: ANSWER }) });
    const { unmount } = render(<AccueilPage />);
    await askInHero("Quel est le taux de chômage en 2023 ?");
    await screen.findByText("22,3 %");
    unmount();

    render(<AccueilPage />);
    expect(await screen.findByText("22,3 %")).toBeTruthy();
    expect(screen.getByText("Quel est le taux de chômage en 2023 ?")).toBeTruthy();
  });
});
