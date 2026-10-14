"use client";

import { useState } from "react";
import { useT } from "@/i18n/LocaleContext";
import { defang } from "@/lib/ioc/defang";
import { IOC_TYPES, type Ioc } from "@/lib/ioc/collect";
import { pivotsFor, type PivotService } from "@/lib/pivots/pivots";
import Breakable from "./Breakable";
import CopyButton from "./CopyButton";
import { DATA, SECTION_TITLE, SMALL_BUTTON } from "./ui";

export default function IocsTab({ iocs, pivots, defangDefault }: { iocs: Ioc[]; pivots: PivotService[]; defangDefault: boolean }) {
  const t = useT();
  // Defanged by default: an IOC pasted in a ticket must not become a live link.
  const [defanged, setDefanged] = useState(defangDefault);
  if (iocs.length === 0) return <p className="text-muted">{t.iocs.none}</p>;
  const shown = (ioc: Ioc) => (defanged ? defang(ioc.type, ioc.value) : ioc.value);
  const groups = IOC_TYPES.map((type) => [type, iocs.filter((ioc) => ioc.type === type)] as const).filter(([, list]) => list.length > 0);

  return (
    <div className="grid gap-8 console:gap-4">
      <div className="flex flex-wrap items-center gap-4 text-sm console:text-xs">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={defanged} onChange={(e) => setDefanged(e.target.checked)} className="accent-signal" />
          {t.iocs.defanged}
        </label>
        <CopyButton text={iocs.map(shown).join("\n")} label={t.iocs.copyAll(iocs.length)} />
        <span className="text-muted">{t.iocs.pivotNote}</span>
      </div>
      {groups.map(([type, list]) => (
        <section key={type} aria-labelledby={`ioc-${type}`}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 id={`ioc-${type}`} className={SECTION_TITLE}>
              {t.iocs.heading(t.iocs.types[type], list.length)}
            </h2>
            <CopyButton text={list.map(shown).join("\n")} />
          </div>
          <ul className="border-t border-rule console:border-t-0 dossier:border-t-0">
            {list.map((ioc) => (
              <IocRow key={ioc.value} ioc={ioc} shown={shown(ioc)} pivots={pivots} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function IocRow({ ioc, shown, pivots: services }: { ioc: Ioc; shown: string; pivots: PivotService[] }) {
  const pivots = pivotsFor(ioc, services);
  return (
    <li className="grid gap-x-6 gap-y-1 border-b border-hairline py-2 lg:grid-cols-[minmax(0,1fr)_auto] console:border-b-0 console:py-0.5 dossier:border-dotted">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className={`${DATA} [overflow-wrap:anywhere]`}>
            <Breakable text={shown} />
          </span>
          <CopyButton text={shown} />
        </p>
        <p className="text-xs text-muted">{ioc.sources.join(" · ")}</p>
      </div>
      {pivots.length > 0 && (
        <div className="flex flex-wrap content-start gap-1.5 lg:justify-end">
          {pivots.map((pivot) => (
            <a key={pivot.id} href={pivot.url} target="_blank" rel="noopener noreferrer" className={SMALL_BUTTON}>
              {pivot.name}
            </a>
          ))}
        </div>
      )}
    </li>
  );
}
