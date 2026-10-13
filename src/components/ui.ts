// Shared class lists. Base classes are the Swiss look; `console:` and
// `dossier:` variants restyle them. Components never pick colours or fonts
// directly — only the tokens defined in globals.css.

/** Small caption above a value or a section. */
export const LABEL =
  "text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted console:text-[11px] console:font-normal console:tracking-wider dossier:text-[13px] dossier:normal-case dossier:tracking-[0.05em] dossier:[font-variant:small-caps]";

export const SECTION_TITLE =
  "mb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted console:mb-1 console:text-[11px] console:font-normal console:tracking-wider dossier:mb-1.5 dossier:border-b dossier:border-rule dossier:text-[13px] dossier:font-semibold dossier:normal-case dossier:tracking-[0.1em] dossier:text-ink dossier:[font-variant:small-caps]";

/** Values copied from the email: addresses, hosts, header text. */
export const DATA = "font-data text-[0.8125rem] console:text-xs";

/** Text in the signal colour: the part that is wrong. */
export const FLAG = "font-semibold text-signal-fg";

const BUTTON_BASE =
  "border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:cursor-not-allowed disabled:opacity-40 console:py-1 console:text-xs dossier:font-data";

export const BUTTON = `${BUTTON_BASE} border-rule hover:bg-ink hover:text-paper`;

export const BUTTON_PRIMARY = `${BUTTON_BASE} border-ink bg-ink text-paper hover:border-signal hover:bg-signal hover:text-on-signal`;
