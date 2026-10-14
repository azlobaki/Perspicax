"use client";

import type { Locale } from "@/lib/i18n/text";
import { useT } from "@/i18n/LocaleContext";

/** French first, as the spec shows it: FR | EN. */
const ORDER: readonly Locale[] = ["fr", "en"];

export default function LocaleSwitch({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  const t = useT();
  return (
    <div role="group" aria-label={t.topBar.language} className="flex border border-rule text-xs">
      {ORDER.map((l) => (
        <button
          key={l}
          id={`locale-${l}`}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          onClick={() => onChange(l)}
          className="border-l border-rule px-2.5 py-1 first:border-l-0 hover:bg-panel aria-pressed:bg-ink aria-pressed:text-paper console:aria-pressed:bg-signal console:aria-pressed:text-on-signal dossier:font-data"
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
