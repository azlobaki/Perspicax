"use client";

import { LOCALES, type Locale } from "@/lib/i18n/text";
import { useT } from "@/i18n/LocaleContext";

export default function LocaleSwitch({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  const t = useT();
  return (
    <div role="group" aria-label={t.topBar.language} className="flex border border-rule text-xs">
      {LOCALES.map((l) => (
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
