import { usePick } from "@/i18n/LocaleContext";
import type { Link, LinkOrigin } from "@/lib/links/analyze";
import { isClickable } from "@/lib/links/analyze";
import type { UrlFlag } from "@/lib/urls/inspect";
import Breakable from "./Breakable";
import { DATA, FLAG, LABEL, SECTION_TITLE } from "./ui";

const ORIGIN_LABEL: Record<LinkOrigin, string> = {
  a: "link",
  area: "map",
  form: "form",
  "meta-refresh": "refresh",
  text: "text",
  img: "image",
  css: "css",
  link: "stylesheet",
  frame: "frame",
  media: "media",
  file: "in file",
  qr: "QR code",
};

const FLAG_LABEL: Record<UrlFlag, string> = {
  "javascript-url": "javascript:",
  "data-url": "data: URL",
  userinfo: "user-name trick",
  lookalike: "lookalike",
  homoglyph: "look-alike characters",
  "disguised-domain": "disguised domain",
  "ip-host": "IP address",
  shortener: "shortener",
  "abused-tld": "abused TLD",
  punycode: "punycode",
  "opaque-wrapper": "rewritten, not reversible",
  unparseable: "unreadable",
};

// Long data: URLs would fill the screen; the start says what they are.
const MAX_SHOWN = 300;

type Badge = { text: string; flagged: boolean };

function badges(link: Link): Badge[] {
  const out: Badge[] = [];
  if (link.shownHost) out.push({ text: `shows ${link.shownHost}`, flagged: true });
  for (const flag of link.url.flags) {
    out.push({
      text: flag === "lookalike" ? `lookalike of ${link.url.lookalikeOf}` : FLAG_LABEL[flag],
      flagged: flag !== "punycode" && flag !== "opaque-wrapper",
    });
  }
  if (link.hidden) out.push({ text: `hidden: ${link.hidden}`, flagged: true });
  if (link.tracking) out.push({ text: link.tracking === "pixel" ? "tracking pixel" : "mailing tracker", flagged: link.tracking === "pixel" });
  return out;
}

export default function LinksTab({ links }: { links: Link[] }) {
  const numbered = links.map((link, i) => ({ link, n: i + 1, badges: badges(link) }));
  const byConcern = (a: (typeof numbered)[number], b: (typeof numbered)[number]) =>
    Number(b.badges.some((x) => x.flagged)) - Number(a.badges.some((x) => x.flagged));
  const clickable = numbered.filter((x) => isClickable(x.link)).sort(byConcern);
  const loaded = numbered.filter((x) => !isClickable(x.link)).sort(byConcern);
  return (
    <div className="grid gap-10 console:gap-4">
      <LinkList id="links-title" title={`Links · ${clickable.length}`} rows={clickable} empty="No links." />
      <LinkList
        id="remote-title"
        title={`Remote content · ${loaded.length}`}
        rows={loaded}
        empty="No remote content."
        note="Loaded automatically by a mail client that shows images. Never loaded here."
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
  const destination = link.url.final ?? link.url.raw;
  const shown = destination.length > MAX_SHOWN ? `${destination.slice(0, MAX_SHOWN)}…` : destination;
  return (
    <li className="grid grid-cols-[2.5rem_5.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-hairline py-2 console:grid-cols-[4ch_10ch_minmax(0,1fr)] console:gap-x-2 console:border-b-0 console:py-0.5 dossier:grid-cols-[2rem_6rem_minmax(0,1fr)] dossier:border-dotted">
      <span className="text-right tabular-nums text-muted console:text-left">{n}</span>
      <span className={LABEL}>{ORIGIN_LABEL[link.origin]}</span>
      <div className="min-w-0">
        {link.text && <p className="font-semibold console:text-xs console:font-normal dossier:font-normal dossier:italic">{link.text.slice(0, 200)}</p>}
        {link.attachment && <p className="text-xs text-muted">in attachment {link.attachment}</p>}
        <p className={`${DATA} [overflow-wrap:anywhere]`}>
          <Breakable text={shown} />
        </p>
        {link.url.displayHost && link.url.displayHost !== link.url.host && (
          <p className={`${DATA} text-muted`}>reads as {link.url.displayHost}</p>
        )}
        {link.url.wrappers.length > 0 && (
          <p className="text-xs text-muted">via {link.url.wrappers.map((w) => pick(w.service)).join(" → ")}</p>
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
