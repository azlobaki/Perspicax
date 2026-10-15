"use client";

import { useT } from "@/i18n/LocaleContext";
import { THEMES, THEME_LABELS, type Theme } from "@/lib/settings";

/** `theme` is null until the saved choice has been read, so nothing shows as pressed by mistake. */
export default function ThemeSwitch({
  theme,
  onChange,
}: {
  theme: Theme | null;
  onChange: (theme: Theme) => void;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={t.topBar.theme} className="flex border border-rule text-xs">
      {THEMES.map((th) => (
        <button
          key={th}
          type="button"
          aria-pressed={th === theme}
          onClick={() => onChange(th)}
          className="border-l border-rule px-2.5 py-1 first:border-l-0 hover:bg-panel aria-pressed:bg-ink aria-pressed:text-paper console:aria-pressed:bg-signal console:aria-pressed:text-on-signal dossier:font-data"
        >
          {THEME_LABELS[th]}
        </button>
      ))}
    </div>
  );
}
