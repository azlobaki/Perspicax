"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export type TabSpec<T extends string> = { id: T; label: string; count?: number };

export default function Tabs<T extends string>({
  label,
  tabs,
  active,
  onChange,
  children,
}: {
  label: string;
  tabs: TabSpec<T>[];
  active: T;
  onChange: (id: T) => void;
  children: ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === active);
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onChange(next.id);
    list.current?.querySelector<HTMLButtonElement>(`#tab-${next.id}`)?.focus();
  }

  return (
    <div className="mt-6 console:mt-0 dossier:mt-8">
      <div
        ref={list}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex flex-wrap border-b border-rule console:border-hairline console:bg-panel dossier:gap-1"
      >
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={tab.id === active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className="mr-6 border-t-[3px] border-transparent pt-2.5 pb-2 font-medium text-muted hover:text-ink aria-selected:border-ink aria-selected:font-bold aria-selected:text-ink console:mr-0 console:border-t-0 console:border-r console:border-hairline console:px-3 console:py-1 console:text-xs console:font-normal console:lowercase console:aria-selected:bg-ink console:aria-selected:font-normal console:aria-selected:text-paper dossier:mr-0 dossier:-mb-px dossier:border dossier:border-b-0 dossier:border-hairline dossier:bg-panel dossier:px-3 dossier:pt-1 dossier:pb-1 dossier:text-sm dossier:font-normal dossier:tracking-[0.05em] dossier:[font-variant:small-caps] dossier:aria-selected:border-rule dossier:aria-selected:bg-paper dossier:aria-selected:font-normal"
          >
            <span className="mr-1.5 text-[10.5px] console:hidden dossier:hidden">{String(i + 1).padStart(2, "0")}</span>
            <span className="hidden console:inline">{i + 1} </span>
            {tab.label}
            {tab.count !== undefined && <span className="ml-1.5 font-normal text-muted">{tab.count}</span>}
          </button>
        ))}
      </div>
      <div id={`panel-${active}`} role="tabpanel" aria-labelledby={`tab-${active}`} className="pt-5 console:pt-2">
        {children}
      </div>
    </div>
  );
}
