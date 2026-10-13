"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeImage } from "@/components/decodeImage";
import EntryPanel from "@/components/EntryPanel";
import Footer from "@/components/Footer";
import { parseHtml } from "@/components/parseHtml";
import ReportView from "@/components/ReportView";
import TopBar, { type FileMeta } from "@/components/TopBar";
import { useSettings } from "@/hooks/useSettings";
import type { ParsedEmail } from "@/lib/email";
import { analyzeEmail, type EmailReport } from "@/lib/analyze";
import { parseEmail, parseHeadersOnly } from "@/lib/mime/parse";

/** Everything about the current email. It lives here, in memory, and nowhere else. */
type Analysis = { id: number; email: ParsedEmail; report: EmailReport; file: FileMeta };

export default function Home() {
  const { settings, setSettings, loaded } = useSettings();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const nextId = useRef(0);

  const analyse = useCallback(async (parse: () => ParsedEmail, name: string, size: number) => {
    try {
      const start = performance.now();
      const email = parse();
      // Organisation domains arrive with the settings panel (milestone 4).
      const report = await analyzeEmail(email, { orgDomains: [], parseHtml, decodeImage });
      const parseMs = Math.round(performance.now() - start);
      setAnalysis({ id: ++nextId.current, email, report, file: { name, size, parseMs } });
      setError(null);
    } catch (err) {
      setError(`Could not read this email: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      if (/\.msg$/i.test(file.name)) {
        setError("Outlook .msg files are not supported yet. Save the message as .eml, or paste its headers.");
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      await analyse(() => parseEmail(bytes), file.name, bytes.length);
    },
    [analyse],
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

  return (
    <>
      <TopBar
        file={analysis?.file ?? null}
        theme={loaded ? settings.theme : null}
        onTheme={(theme) => setSettings((current) => ({ ...current, theme }))}
        onClose={() => setAnalysis(null)}
      />
      {analysis ? (
        <ReportView key={analysis.id} email={analysis.email} report={analysis.report} />
      ) : (
        <EntryPanel
          dragging={dragging}
          error={error}
          onFile={(file) => void openFile(file)}
          onHeaders={(text) => void analyse(() => parseHeadersOnly(text), "Pasted headers", new TextEncoder().encode(text).length)}
        />
      )}
      <Footer />
    </>
  );
}
