"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Always-on notice, shown above every screen (wired in app/layout.tsx) —
 * the product borrows the ANSD's name and logo throughout (see Header.tsx,
 * ChatHeader.tsx), so it needs an equally visible disclaimer that this is
 * an unaffiliated hackathon demo, not an official ANSD product. Plain
 * inline Tailwind on purpose, no dependency on either visual system's
 * tokens (the CSS-Modules `--c-*` custom properties or the Tailwind
 * `brand-*` theme) — this banner has to render identically above all six
 * screens regardless of which one loads.
 *
 * Publishes its own rendered height as `--disclaimer-banner-height` on the
 * root element. `/accueil` is a "locked to the viewport, only the message
 * list scrolls" chat layout — its shell is `position: fixed` (see its own
 * comment for why that replaced an earlier percentage-height approach that
 * broke after the empty-state → conversation transition) and needs to know
 * exactly how tall this banner is to sit flush below it without either
 * gap or overlap. The banner's own height isn't a fixed constant — this
 * text wraps to two or three lines on a narrow viewport — so it's measured
 * with a ResizeObserver rather than hardcoded.
 */
export default function DemoDisclaimerBanner() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty("--disclaimer-banner-height", `${el.offsetHeight}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="w-full border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium leading-snug text-amber-900"
    >
      Démo réalisée dans le cadre d&rsquo;un hackathon — ce site n&rsquo;est
      affilié à l&rsquo;ANSD d&rsquo;aucune manière et n&rsquo;est pas un site
      officiel.
    </div>
  );
}
