"use client";

import { useT } from "@/i18n/LocaleContext";
import { formatSize } from "@/lib/format";
import type { Locale } from "@/lib/i18n/text";
import type { Theme } from "@/lib/settings";
import LocaleSwitch from "./LocaleSwitch";
import ThemeSwitch from "./ThemeSwitch";
import { BUTTON, DATA, HEADER, LABEL, WORDMARK } from "./ui";

export type FileMeta = { name: string; size: number; parseMs: number };

export default function TopBar({
  file,
  theme,
  onTheme,
  locale,
  onLocale,
  onClose,
  settingsOpen,
  onSettings,
}: {
  file: FileMeta | null;
  theme: Theme | null;
  onTheme: (theme: Theme) => void;
  locale: Locale;
  onLocale: (locale: Locale) => void;
  onClose: () => void;
  settingsOpen: boolean;
  onSettings: () => void;
}) {
  const t = useT();
  return (
    <header className={HEADER}>
      <span className={WORDMARK}>
        Perspicax
      </span>
      {file && (
        <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm console:gap-x-5 console:text-xs console:*:flex console:*:gap-2">
          <div>
            <dt className={LABEL}>{t.topBar.file}</dt>
            <dd className={`${DATA} break-all`}>{file.name}</dd>
          </div>
          <div>
            <dt className={LABEL}>{t.topBar.sizeParse}</dt>
            <dd className="tabular-nums">
              {formatSize(file.size, locale)} · {file.parseMs} ms
            </dd>
          </div>
        </dl>
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
        {file && (
          <button type="button" className={`${BUTTON} whitespace-nowrap`} onClick={onClose}>
            {t.topBar.newEmail}
          </button>
        )}
        <button
          id="open-settings"
          type="button"
          aria-pressed={settingsOpen}
          className={`${BUTTON} aria-pressed:bg-ink aria-pressed:text-paper`}
          onClick={onSettings}
        >
          {t.topBar.settings}
        </button>
        <LocaleSwitch locale={locale} onChange={onLocale} />
        <ThemeSwitch theme={theme} onChange={onTheme} />
      </div>
    </header>
  );
}
