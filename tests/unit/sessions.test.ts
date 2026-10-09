import { describe, expect, it } from "vitest";
import {
  INTERRUPTED_MESSAGE,
  groupSessions,
  loadSessions,
  quickTitle,
  saveSessions,
  sessionMatches,
  type ChatSession,
} from "@/lib/sessions";

function session(partial: Partial<ChatSession>): ChatSession {
  return { id: "s", title: "Titre", createdAt: 0, updatedAt: 0, turns: [], ...partial };
}

describe("quickTitle", () => {
  it("garde les mots importants de la question", () => {
    expect(quickTitle("Quelle est l'espérance de vie en 2023 ?")).toBe("Espérance vie 2023");
  });
  it("titre par defaut sans mot important", () => {
    expect(quickTitle("Quel est le ?")).toBe("Nouvelle discussion");
  });
  it("limite la longueur", () => {
    expect(quickTitle("a".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe("sessionMatches", () => {
  const s = session({
    title: "Chômage",
    turns: [{ id: "t", question: "Taux de chômage ?", status: "done", response: { answer: "22,3 % à Dakar" } as never }],
  });
  it("cherche sans tenir compte des accents ni des majuscules", () => {
    expect(sessionMatches(s, "CHOMAGE")).toBe(true);
    expect(sessionMatches(s, "dakar")).toBe(true);
    expect(sessionMatches(s, "inflation")).toBe(false);
    expect(sessionMatches(s, "   ")).toBe(true);
  });
});

describe("groupSessions", () => {
  it("range les discussions par anciennete, les plus recentes d'abord", () => {
    const now = new Date(2026, 9, 9, 15).getTime();
    const day = 24 * 3600 * 1000;
    const groups = groupSessions(
      [
        session({ id: "vieux", updatedAt: now - 30 * day }),
        session({ id: "hier", updatedAt: now - day }),
        session({ id: "auj", updatedAt: now - 1000 }),
        session({ id: "semaine", updatedAt: now - 3 * day }),
      ],
      now
    );
    expect(groups.map((g) => [g.label, g.sessions.map((s) => s.id)])).toEqual([
      ["Aujourd'hui", ["auj"]],
      ["Hier", ["hier"]],
      ["7 derniers jours", ["semaine"]],
      ["Plus ancien", ["vieux"]],
    ]);
  });
});

describe("loadSessions / saveSessions", () => {
  it("restaure l'historique et la discussion active", () => {
    const s = session({ id: "a", updatedAt: 2, turns: [{ id: "t", question: "Q ?", status: "done" }] });
    saveSessions([s], "a");
    expect(loadSessions()).toEqual({ sessions: [s], activeId: "a" });
  });

  it("marque comme interrompue une reponse en cours lors du rechargement", () => {
    saveSessions([session({ id: "a", turns: [{ id: "t", question: "Q ?", status: "loading" }] })], "a");
    const turn = loadSessions().sessions[0].turns[0];
    expect(turn.status).toBe("error");
    expect(turn.error).toBe(INTERRUPTED_MESSAGE);
    expect(turn.interrupted).toBe(true);
  });

  it("n'enregistre pas l'audio de l'utilisateur (URL temporaire)", () => {
    saveSessions([session({ turns: [{ id: "t", question: "Q", status: "done", audioUrl: "blob:x" }] })], null);
    expect(localStorage.getItem("ansd-rag:sessions:v1")).not.toContain("blob:x");
  });

  it("ignore un stockage corrompu et une discussion active inexistante", () => {
    localStorage.setItem("ansd-rag:sessions:v1", "{pas du json");
    expect(loadSessions()).toEqual({ sessions: [], activeId: null });
    saveSessions([session({ id: "a" })], "inexistante");
    expect(loadSessions().activeId).toBeNull();
  });

  it("garde au plus 50 discussions, les plus recentes", () => {
    const many = Array.from({ length: 60 }, (_, i) => session({ id: `s${i}`, updatedAt: i }));
    saveSessions(many, null);
    const { sessions } = loadSessions();
    expect(sessions).toHaveLength(50);
    expect(sessions[0].id).toBe("s59");
  });
});
