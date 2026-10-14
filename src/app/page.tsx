"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeImage } from "@/components/decodeImage";
import EntryPanel from "@/components/EntryPanel";
import Footer from "@/components/Footer";
import { parseHtml } from "@/components/parseHtml";
import ReportView from "@/components/ReportView";
import SettingsPanel from "@/components/SettingsPanel";
import TopBar, { type FileMeta } from "@/components/TopBar";
import { LocaleProvider } from "@/i18n/LocaleContext";
import { useSettings } from "@/hooks/useSettings";
import { analyzeEmail, type EmailReport } from "@/lib/analyze";
import type { ParsedEmail } from "@/lib/email";
import { parseEmail, parseHeadersOnly } from "@/lib/mime/parse";
import { parseMsg } from "@/lib/msg/parse";

/** The current email. It lives here, in memory, and nowhere else. */
type Loaded = { id: number; email: ParsedEmail; file: FileMeta };

// OLE compound files (.msg) start with this signature, whatever their name.
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export default function Home() {
  const { settings, setSettings, loaded: settingsLoaded, locale, setLocale } = useSettings();
  const [current, setCurrent] = useState<Loaded | null>(null);
  const [result, setResult] = useState<{ id: number; report: EmailReport } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const nextId = useRef(0);
  const orgDomains = settings.orgDomains.join("\n");
  const vipNames = settings.vipNames.join("\n");

  const load = useCallback((parse: () => ParsedEmail, name: string, size: number) => {
    try {
      const start = performance.now();
      const email = parse();
      setCurrent({ id: ++nextId.current, email, file: { name, size, parseMs: Math.round(performance.now() - start) } });
      setError(null);
      setShowSettings(false);
    } catch (err) {
      setError(`Could not read this email: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // Analyses the email in memory, and again whenever the organisation's domains or protected names change.
  useEffect(() => {
    if (!current || !settingsLoaded) return;
    let cancelled = false;
    analyzeEmail(current.email, {
      orgDomains: orgDomains ? orgDomains.split("\n") : [],
      vipNames: vipNames ? vipNames.split("\n") : [],
      parseHtml,
      decodeImage,
    })
      .then((report) => {
        if (!cancelled) setResult({ id: current.id, report });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [current, orgDomains, vipNames, settingsLoaded]);

  const openFile = useCallback(
    async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isMsg = /\.msg$/i.test(file.name) || OLE_SIGNATURE.every((byte, i) => bytes[i] === byte);
      load(() => (isMsg ? parseMsg(bytes) : parseEmail(bytes)), file.name, bytes.length);
    },
    [load],
  );

  // A file dropped anywhere on the page is opened, replacing the current one.
  useEffect(() => {
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (event: DragEvent) => event.preventDefault();
    const drop = (event: DragEvent) => {
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) void openFile(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [openFile]);

  const report = current && result?.id === current.id ? result.report : null;

  let main: React.ReactNode;
  if (showSettings) {
    main = <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />;
  } else if (current && report) {
    main = (
      <ReportView
        key={current.id}
        email={current.email}
        report={report}
        file={current.file}
        defang={settings.defang}
        pivots={settings.pivots}
      />
    );
  } else if (current) {
    main = (
      <main className="flex-1 px-4 py-8 sm:px-6">
        <p role={error ? "alert" : "status"} className={error ? "font-semibold text-signal-fg" : "text-muted"}>
          {error ?? "Analysing…"}
        </p>
      </main>
    );
  } else {
    main = (
      <EntryPanel
        dragging={dragging}
        error={error}
        onFile={(file) => void openFile(file)}
        onHeaders={(text) => load(() => parseHeadersOnly(text), "Pasted headers", new TextEncoder().encode(text).length)}
      />
    );
  }

  return (
    <LocaleProvider locale={locale}>
      <div data-localised className="contents">
        <TopBar
          file={current?.file ?? null}
          theme={settingsLoaded ? settings.theme : null}
          onTheme={(theme) => setSettings((s) => ({ ...s, theme }))}
          locale={locale}
          onLocale={setLocale}
          onClose={() => {
            setCurrent(null);
            setResult(null);
          }}
          settingsOpen={showSettings}
          onSettings={() => setShowSettings((open) => !open)}
        />
        {main}
        <Footer />
      </div>
    </LocaleProvider>
  );
}
