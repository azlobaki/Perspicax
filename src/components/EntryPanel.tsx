"use client";

import { useRef, useState } from "react";
import { BUTTON, BUTTON_PRIMARY, DATA, FLAG, LABEL } from "./ui";

const PROMISES = [
  ["No server", "The page is static. There is nowhere to send the email, and nothing tries."],
  ["Nothing stored", "The email lives in this tab's memory. Reload and it is gone; only your settings are kept."],
  ["Works offline", "Turn the network off and drop a file: the analysis is the same."],
] as const;

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
  const input = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");

  return (
    <main className="grid flex-1 content-start gap-8 px-4 py-8 sm:px-6 lg:grid-cols-12 console:py-4 dossier:py-10">
      <section
        aria-label="Open an email"
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
              Raw headers
            </label>
            <textarea
              id="headers-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
              rows={14}
              placeholder="Received: from …"
              className={`${DATA} min-h-60 flex-1 resize-y border border-rule bg-paper p-3 focus-visible:outline-2 focus-visible:outline-signal console:bg-panel`}
            />
            <div className="flex gap-3">
              <button type="submit" className={BUTTON_PRIMARY} disabled={!text.trim()}>
                Analyse headers
              </button>
              <button type="button" className={BUTTON} onClick={() => setPasting(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl console:text-xl console:font-semibold console:tracking-normal dossier:text-3xl dossier:font-semibold">
              Drop an email to analyse it.
            </h1>
            <p className="mt-3 max-w-prose text-muted">
              A <span className={DATA}>.eml</span> file from any mail client, or the raw headers of a message. It is
              read in this page and never leaves it.
            </p>
            <div className="mt-auto flex flex-wrap gap-3 pt-8">
              <button type="button" className={BUTTON_PRIMARY} onClick={() => input.current?.click()}>
                Choose a file…
              </button>
              <button type="button" className={BUTTON} onClick={() => setPasting(true)}>
                Paste headers
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

      <aside aria-label="Privacy" className="lg:col-span-5">
        <ul className="border-t border-rule console:border-t-0 dossier:border-t-0">
          {PROMISES.map(([title, body]) => (
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
