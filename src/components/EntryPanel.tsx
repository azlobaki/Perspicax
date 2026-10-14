"use client";

import { useRef, useState } from "react";
import { useT } from "@/i18n/LocaleContext";
import { BUTTON, BUTTON_PRIMARY, DATA, FLAG, LABEL } from "./ui";

export default function EntryPanel({
  dragging,
  error,
  onFile,
  onHeaders,
}: {
  dragging: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onHeaders: (text: string) => void;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");

  return (
    <main className="grid flex-1 content-start gap-8 px-4 py-8 sm:px-6 lg:grid-cols-12 console:py-4 dossier:py-10">
      <section
        aria-label={t.entry.openAria}
        data-dragging={dragging || undefined}
        className="flex min-h-72 flex-col border border-rule p-6 data-dragging:bg-panel lg:col-span-7 console:border-hairline console:p-4 dossier:border-dashed dossier:p-8"
      >
        {pasting ? (
          <form
            className="flex flex-1 flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim()) onHeaders(text);
            }}
          >
            <label htmlFor="headers-input" className={LABEL}>
              {t.entry.rawHeaders}
            </label>
            <textarea
              id="headers-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
              rows={14}
              placeholder={t.entry.headersPlaceholder}
              className={`${DATA} min-h-60 flex-1 resize-y border border-rule bg-paper p-3 focus-visible:outline-2 focus-visible:outline-signal console:bg-panel`}
            />
            <div className="flex gap-3">
              <button type="submit" className={BUTTON_PRIMARY} disabled={!text.trim()}>
                {t.entry.analyseHeaders}
              </button>
              <button type="button" className={BUTTON} onClick={() => setPasting(false)}>
                {t.entry.cancel}
              </button>
            </div>
          </form>
        ) : (
          <>
            <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl console:text-xl console:font-semibold console:tracking-normal dossier:text-3xl dossier:font-semibold">
              {t.entry.title}
            </h1>
            <p className="mt-3 max-w-prose text-muted">
              {t.entry.introA}
              <span className={DATA}>.eml</span>
              {t.entry.introB}
              <span className={DATA}>.msg</span>
              {t.entry.introC}
            </p>
            <div className="mt-auto flex flex-wrap gap-3 pt-8">
              <button type="button" className={BUTTON_PRIMARY} onClick={() => input.current?.click()}>
                {t.entry.chooseFile}
              </button>
              <button type="button" className={BUTTON} onClick={() => setPasting(true)}>
                {t.entry.pasteHeaders}
              </button>
            </div>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept=".eml,.msg,message/rfc822"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
        {error && (
          <p role="alert" className={`mt-4 ${FLAG}`}>
            {error}
          </p>
        )}
      </section>

      <aside aria-label={t.entry.privacyAria} className="lg:col-span-5">
        <ul className="border-t border-rule console:border-t-0 dossier:border-t-0">
          {t.entry.promises.map(({ title, body }) => (
            <li key={title} className="border-b border-hairline py-3 console:border-b-0 console:py-1 dossier:py-2.5">
              <p className="font-bold console:font-normal console:text-signal-fg dossier:font-semibold">{title}</p>
              <p className="text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
