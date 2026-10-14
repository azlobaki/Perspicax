import { LABEL } from "./ui";

/**
 * AGPL section 13: a copy offered to users over a network has to offer them
 * the source it runs on. Point this at the public repository before
 * deploying — the link appears as soon as it is filled in.
 */
const SOURCE_URL: string = "https://github.com/azlobaki/Perspicax";

export default function Footer() {
  return (
    <footer className="grid gap-1 border-t border-rule px-4 py-2 sm:px-6 console:border-hairline console:bg-panel dossier:border-t-2">
      <p className="text-xs text-muted">
        Decision support only: verdicts are heuristics, they can be wrong either way, and they never replace a
        qualified human analysis.
      </p>
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
        <span className={LABEL}>Offline · the email never leaves this tab</span>
        <span className="flex gap-4">
          {/* A plain link: Next's <Link> would prefetch, which the page's CSP forbids. */}
          <a className={`${LABEL} underline`} href="/mentions-legales">
            Mentions légales
          </a>
          {SOURCE_URL && (
            <a className={`${LABEL} underline`} href={SOURCE_URL} target="_blank" rel="noreferrer">
              Source
            </a>
          )}
        </span>
      </div>
    </footer>
  );
}
