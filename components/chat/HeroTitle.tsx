"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Titre d'accueil, revele mot par mot a l'arrivee sur la page (montee +
 * flou qui se dissipe), puis « en chiffres » garde un reflet degrade qui
 * glisse lentement. Desactive si l'utilisateur a demande a reduire les
 * animations.
 */
const LINES: { text: string; highlight?: boolean }[][] = [
  [{ text: "Le" }, { text: "Sénégal" }, { text: "en chiffres,", highlight: true }],
  [{ text: "à" }, { text: "portée" }, { text: "de" }, { text: "question." }],
];

export function HeroTitle() {
  const reduceMotion = useReducedMotion();
  let index = 0;

  return (
    <h1 className="text-[2.5rem] font-extrabold leading-[1.1] tracking-tight text-brand-900 sm:text-6xl">
      {LINES.map((line, l) => (
        <span key={l} className="block">
          {line.map((word) => {
            const delay = 0.08 * index++;
            return (
              <motion.span
                key={word.text}
                className="inline-block whitespace-pre"
                initial={reduceMotion ? false : { opacity: 0, y: 24, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
              >
                {word.highlight ? (
                  <motion.span
                    className="bg-gradient-to-r from-brand-600 via-brand-400 to-brand-800 bg-[length:200%_auto] bg-clip-text text-transparent"
                    animate={reduceMotion ? undefined : { backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: delay + 0.6 }}
                  >
                    {word.text}
                  </motion.span>
                ) : (
                  word.text
                )}
                {" "}
              </motion.span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
