import { usePick, useT } from "@/i18n/LocaleContext";
import type { Link } from "@/lib/links/analyze";
import { isClickable } from "@/lib/links/analyze";
import type { Messages } from "@/i18n/messages";
import type { Text } from "@/lib/i18n/text";
import Breakable from "./Breakable";
import { DATA, FLAG, LABEL, SECTION_TITLE } from "./ui";

// Long data: URLs would fill the screen; the start says what they are.
const MAX_SHOWN = 300;

type Badge = { text: string; flagged: boolean };

function badges(link: Link, t: Messages, pick: (text: Text) => string): Badge[] {
  const out: Badge[] = [];
  if (link.shownHost) out.push({ text: t.links.shows(link.shownHost), flagged: true });
  for (const flag of link.url.flags) {
    out.push({
      text: flag === "lookalike" ? t.links.lookalikeOf(link.url.lookalikeOf ?? "") : t.links.flags[flag],
      flagged: flag !== "punycode" && flag !== "opaque-wrapper",
    });
  }
  if (link.hidden) out.push({ text: t.links.hidden(pick(link.hidden)), flagged: true });
  if (link.tracking) out.push({ text: link.tracking === "pixel" ? t.links.trackingPixel : t.links.mailingTracker, flagged: link.tracking === "pixel" });
  return out;
}

export default function LinksTab({ links }: { links: Link[] }) {
  const t = useT();
  const pick = usePick();
  const numbered = links.map((link, i) => ({ link, n: i + 1, badges: badges(link, t, pick) }));
  const byConcern = (a: (typeof numbered)[number], b: (typeof numbered)[number]) =>
    Number(b.badges.some((x) => x.flagged)) - Number(a.badges.some((x) => x.flagged));
  const clickable = numbered.filter((x) => isClickable(x.link)).sort(byConcern);
  const loaded = numbered.filter((x) => !isClickable(x.link)).sort(byConcern);
  return (
    <div className="grid gap-10 console:gap-4">
      <LinkList id="links-title" title={t.links.heading(clickable.length)} rows={clickable} empty={t.links.none} />
      <LinkList
        id="remote-title"
        title={t.links.remoteHeading(loaded.length)}
        rows={loaded}
        empty={t.links.noRemote}
        note={t.links.remoteNote}
      />
    </div>
  );
}

function LinkList({ id, title, rows, empty, note }: {
  id: string;
  title: string;
  rows: { link: Link; n: number; badges: Badge[] }[];
  empty: string;
  note?: string;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={SECTION_TITLE}>
        {title}
      </h2>
      {note && <p className="mb-2 text-sm text-muted console:text-xs">{note}</p>}
      {rows.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <ol className="border-t border-rule console:border-t-0 dossier:border-t-0">
          {rows.map(({ link, n, badges: list }) => (
            <LinkRow key={n} link={link} n={n} badges={list} />
          ))}
        </ol>
      )}
    </section>
  );
}

function LinkRow({ link, n, badges: list }: { link: Link; n: number; badges: Badge[] }) {
  const pick = usePick();
  const t = useT();
  const destination = link.url.final ?? link.url.raw;
  const shown = destination.length > MAX_SHOWN ? `${destination.slice(0, MAX_SHOWN)}…` : destination;
  return (
    <li className="grid grid-cols-[2.5rem_5.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-hairline py-2 console:grid-cols-[4ch_10ch_minmax(0,1fr)] console:gap-x-2 console:border-b-0 console:py-0.5 dossier:grid-cols-[2rem_6rem_minmax(0,1fr)] dossier:border-dotted">
      <span className="text-right tabular-nums text-muted console:text-left">{n}</span>
      <span className={LABEL}>{t.links.origin[link.origin]}</span>
      <div className="min-w-0">
        {link.text && <p className="font-semibold console:text-xs console:font-normal dossier:font-normal dossier:italic">{link.text.slice(0, 200)}</p>}
        {link.attachment && <p className="text-xs text-muted">{t.links.inAttachment(link.attachment)}</p>}
        <p className={`${DATA} [overflow-wrap:anywhere]`}>
          <Breakable text={shown} />
        </p>
        {link.url.displayHost && link.url.displayHost !== link.url.host && (
          <p className={`${DATA} text-muted`}>{t.links.readsAs(link.url.displayHost)}</p>
        )}
        {link.url.wrappers.length > 0 && (
          <p className="text-xs text-muted">{t.links.via}{link.url.wrappers.map((w) => pick(w.service)).join(" → ")}</p>
        )}
        {list.length > 0 && (
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
            {list.map((badge) => (
              <span key={badge.text} className={badge.flagged ? `${FLAG} dossier:italic` : "text-muted"}>
                {badge.text}
              </span>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}
