"use client";

import { formatSize } from "@/lib/format";
import type { Theme } from "@/lib/settings";
import ThemeSwitch from "./ThemeSwitch";
import { BUTTON, DATA, LABEL } from "./ui";

export type FileMeta = { name: string; size: number; parseMs: number };

export default function TopBar({
  file,
  theme,
  onTheme,
  onClose,
  settingsOpen,
  onSettings,
}: {
  file: FileMeta | null;
  theme: Theme | null;
  onTheme: (theme: Theme) => void;
  onClose: () => void;
  settingsOpen: boolean;
  onSettings: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-rule px-4 py-2.5 sm:px-6 suisse:border-t-[6px] suisse:border-t-ink console:border-hairline console:bg-panel console:py-1.5 dossier:border-b-2">
      <span className="font-display text-lg font-extrabold tracking-tight console:text-sm console:font-semibold console:lowercase console:tracking-normal console:text-signal-fg dossier:text-base dossier:font-semibold dossier:tracking-[0.08em] dossier:[font-variant:small-caps]">
        Perspicax
      </span>
      {file && (
        <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm console:gap-x-5 console:text-xs console:*:flex console:*:gap-2">
          <div>
            <dt className={LABEL}>File</dt>
            <dd className={`${DATA} break-all`}>{file.name}</dd>
          </div>
          <div>
            <dt className={LABEL}>Size · parse</dt>
            <dd className="tabular-nums">
              {formatSize(file.size)} · {file.parseMs} ms
            </dd>
          </div>
        </dl>
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
        {file && (
          <button type="button" className={`${BUTTON} whitespace-nowrap`} onClick={onClose}>
            New email
          </button>
        )}
        <button
          id="open-settings"
          type="button"
          aria-pressed={settingsOpen}
          className={`${BUTTON} aria-pressed:bg-ink aria-pressed:text-paper`}
          onClick={onSettings}
        >
          Settings
        </button>
        <ThemeSwitch theme={theme} onChange={onTheme} />
      </div>
    </header>
  );
}
