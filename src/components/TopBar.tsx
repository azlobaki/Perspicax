"use client";

import type { Theme } from "@/lib/settings";
import ThemeSwitch from "./ThemeSwitch";

export default function TopBar({
  theme,
  onTheme,
}: {
  theme: Theme | null;
  onTheme: (theme: Theme) => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-rule px-4 py-2.5 sm:px-6 suisse:border-t-[6px] suisse:border-t-ink console:border-hairline console:bg-panel console:py-1.5 dossier:border-b-2">
      <span className="font-display text-lg font-extrabold tracking-tight console:text-sm console:font-semibold console:lowercase console:tracking-normal console:text-signal-fg dossier:text-base dossier:font-semibold dossier:tracking-[0.08em] dossier:[font-variant:small-caps]">
        Perspicax
      </span>
      <div className="ml-auto flex items-center gap-3">
        <ThemeSwitch theme={theme} onChange={onTheme} />
      </div>
    </header>
  );
}
