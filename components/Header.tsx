import styles from "./Header.module.css";
import { GlobeIcon } from "./icons";

export type Lang = "FR" | "WO" | "EN";

const LANGS: Lang[] = ["FR", "WO", "EN"];

/**
 * `onLangChange` is optional: the five static-reference screens render the
 * segmented switch with a fixed `activeLang` and no wiring, exactly as
 * before. `/accueil`, the live query flow, passes it to actually change the
 * `language` sent to the backend. `extra` is an optional slot before the
 * globe icon — `/accueil` uses it for "Nouvelle conversation".
 */
export default function Header({
  activeLang,
  showGlobeIcon = false,
  onLangChange,
  extra,
}: {
  activeLang: Lang;
  showGlobeIcon?: boolean;
  onLangChange?: (lang: Lang) => void;
  extra?: React.ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.name}>XAMXAM</span>
        <span className={styles.tagline}>Statistiques — ANSD</span>
      </div>
      <div className={styles.right}>
        {extra}
        {showGlobeIcon && <GlobeIcon />}
        <div className={styles.langSwitch} role="group" aria-label="Langue de l'interface">
          {LANGS.map((lang) => (
            <button
              key={lang}
              type="button"
              aria-pressed={lang === activeLang}
              onClick={onLangChange ? () => onLangChange(lang) : undefined}
              className={
                lang === activeLang
                  ? `${styles.langOption} ${styles.langOptionActive}`
                  : styles.langOption
              }
            >
              {lang}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
