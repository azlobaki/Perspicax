"use client";

import { useState } from "react";
import { IOC_TYPES } from "@/lib/ioc/types";
import { DEFAULT_PIVOTS, type PivotService } from "@/lib/pivots/pivots";
import { DEFAULT_SETTINGS, SETTINGS_KEY, isValidTemplate, normaliseDomain, type Settings } from "@/lib/settings";
import { BUTTON, BUTTON_PRIMARY, DATA, FLAG, SECTION_TITLE, SMALL_BUTTON } from "./ui";

const FIELD = "border border-hairline bg-paper px-2 py-1 focus-visible:outline-2 focus-visible:outline-signal console:bg-panel";

export default function SettingsPanel({ settings, onChange, onClose }: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
}) {
  const [domains, setDomains] = useState(settings.orgDomains.join("\n"));
  const [pivots, setPivots] = useState<PivotService[]>(settings.pivots);

  const entered = domains.split(/[\s,;]+/).filter(Boolean);
  const invalid = entered.filter((d) => normaliseDomain(d) === null);
  const valid = [...new Set(entered.map(normaliseDomain).filter((d): d is string => d !== null))];
  const brokenPivots = pivots.filter((p) => !p.name.trim() || p.types.length === 0 || !isValidTemplate(p.template));
  const update = (index: number, patch: Partial<PivotService>) =>
    setPivots((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  return (
    <main className="flex-1 px-4 py-8 sm:px-6 console:py-4">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4 border-b-[3px] border-rule pb-4 console:border-b console:border-hairline dossier:border-b-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight console:text-lg console:font-semibold console:tracking-normal dossier:text-3xl dossier:font-semibold">
          Settings
        </h1>
        <button type="button" className={BUTTON} onClick={onClose}>
          Done
        </button>
      </div>

      <div className="grid gap-12 lg:grid-cols-12 console:gap-6">
        <div className="grid content-start gap-10 lg:col-span-5 console:gap-6">
          <section aria-labelledby="org-title">
            <h2 id="org-title" className={SECTION_TITLE}>
              Organisation domains
            </h2>
            <p className="mb-2 text-sm text-muted">
              Your own domains, one per line. A spoofed sender in one of them weighs more, and domains that imitate them are
              flagged.
            </p>
            <textarea
              aria-label="Organisation domains"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder="example.com"
              className={`${DATA} ${FIELD} w-full`}
            />
            {invalid.length > 0 && <p className={`${FLAG} text-sm`}>Not a domain: {invalid.join(", ")}</p>}
            <button
              type="button"
              className={`${BUTTON_PRIMARY} mt-2`}
              disabled={valid.join("\n") === settings.orgDomains.join("\n")}
              onClick={() => onChange({ ...settings, orgDomains: valid })}
            >
              Save domains
            </button>
          </section>

          <section aria-labelledby="ioc-settings-title">
            <h2 id="ioc-settings-title" className={SECTION_TITLE}>
              Indicators
            </h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-signal"
                checked={settings.defang}
                onChange={(e) => onChange({ ...settings, defang: e.target.checked })}
              />
              Defang by default — in the IOCs tab, when copying, and in the Markdown report
            </label>
          </section>

          <section aria-labelledby="storage-title">
            <h2 id="storage-title" className={SECTION_TITLE}>
              Storage
            </h2>
            <p className="text-sm text-muted">
              These settings are the only thing Perspicax keeps, in this browser, under{" "}
              <span className={DATA}>{SETTINGS_KEY}</span>. Emails are never stored.
            </p>
            <button
              type="button"
              className={`${BUTTON} mt-2`}
              onClick={() => {
                setDomains("");
                setPivots(DEFAULT_PIVOTS);
                onChange({ ...DEFAULT_SETTINGS, theme: settings.theme });
              }}
            >
              Reset settings
            </button>
          </section>
        </div>

        <section aria-labelledby="pivot-title" className="lg:col-span-7">
          <h2 id="pivot-title" className={SECTION_TITLE}>
            Pivot services
          </h2>
          <p className="mb-3 text-sm text-muted">
            URL templates: <span className={DATA}>{"{value}"}</span> is the indicator URL-encoded,{" "}
            <span className={DATA}>{"{raw}"}</span> as is, <span className={DATA}>{"{base64url}"}</span> in VirusTotal&apos;s URL form.
            A pivot opens only when you click it.
          </p>
          <ul className="border-t border-rule console:border-hairline">
            {pivots.map((pivot, i) => (
              <li key={pivot.id} className="grid gap-1.5 border-b border-hairline py-2.5">
                <div className="flex flex-wrap gap-2">
                  <input
                    aria-label="Service name"
                    value={pivot.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className={`${FIELD} w-36 text-sm`}
                  />
                  <input
                    aria-label="URL template"
                    value={pivot.template}
                    onChange={(e) => update(i, { template: e.target.value })}
                    spellCheck={false}
                    className={`${DATA} ${FIELD} min-w-0 flex-1 ${isValidTemplate(pivot.template) ? "" : "border-signal"}`}
                  />
                  <button type="button" className={SMALL_BUTTON} onClick={() => setPivots((list) => list.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </div>
                <fieldset className="flex flex-wrap gap-x-4 text-xs">
                  <legend className="sr-only">Indicator types for {pivot.name || "this service"}</legend>
                  {IOC_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="accent-signal"
                        checked={pivot.types.includes(type)}
                        onChange={(e) =>
                          update(i, { types: e.target.checked ? [...pivot.types, type] : pivot.types.filter((t) => t !== type) })
                        }
                      />
                      {type}
                    </label>
                  ))}
                </fieldset>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={SMALL_BUTTON}
              onClick={() =>
                setPivots((list) => [...list, { id: `custom-${Date.now().toString(36)}`, name: "", types: ["domain"], template: "https://" }])
              }
            >
              Add a service
            </button>
            <button type="button" className={SMALL_BUTTON} onClick={() => setPivots(DEFAULT_PIVOTS)}>
              Restore defaults
            </button>
            <button
              type="button"
              className={BUTTON_PRIMARY}
              disabled={brokenPivots.length > 0}
              onClick={() => onChange({ ...settings, pivots })}
            >
              Save services
            </button>
          </div>
          {brokenPivots.length > 0 && (
            <p className={`${FLAG} mt-2 text-sm`}>
              Every service needs a name, at least one type, and an http(s) template containing {"{value}"}, {"{raw}"} or{" "}
              {"{base64url}"}.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
