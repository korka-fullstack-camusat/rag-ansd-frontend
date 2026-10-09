import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Composer } from "@/components/chat/Composer";

function Harness({ onSubmit, onCancel }: { onSubmit: (v: string) => void; onCancel?: () => void }) {
  const [value, setValue] = useState("");
  return (
    <Composer
      variant="footer"
      placeholder="Posez une question…"
      value={value}
      onChange={setValue}
      onSubmit={() => onSubmit(value)}
      onCancel={onCancel}
      listening={false}
      onMicClick={() => {}}
    />
  );
}

describe("Composer (champ de saisie)", () => {
  it("Entrée envoie la question", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const field = screen.getByPlaceholderText("Posez une question…");
    fireEvent.change(field, { target: { value: "Taux de chômage ?" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("Taux de chômage ?");
  });

  it("Maj + Entrée passe à la ligne sans envoyer", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const field = screen.getByPlaceholderText("Posez une question…");
    fireEvent.change(field, { target: { value: "Ligne un" } });
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(field.tagName).toBe("TEXTAREA");
  });

  it("n'envoie pas une question vide", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const field = screen.getByPlaceholderText("Posez une question…");
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la question" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Échap annule une question en cours de modification", () => {
    const onCancel = vi.fn();
    render(<Harness onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Posez une question…"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });
});
