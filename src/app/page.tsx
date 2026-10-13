"use client";

import TopBar from "@/components/TopBar";
import { useSettings } from "@/hooks/useSettings";

export default function Home() {
  const { settings, setSettings, loaded } = useSettings();
  return (
    <>
      <TopBar
        theme={loaded ? settings.theme : null}
        onTheme={(theme) => setSettings((current) => ({ ...current, theme }))}
      />
      <main className="flex-1 px-4 py-8 sm:px-6">
        <p className="max-w-prose">Perspicax analyses phishing emails without leaving the browser.</p>
      </main>
    </>
  );
}
