import { LABEL } from "./ui";

/**
 * AGPL section 13: a copy offered to users over a network has to offer them
 * the source it runs on. Point this at the public repository before
 * deploying — the link appears as soon as it is filled in.
 */
const SOURCE_URL: string = "";

export default function Footer() {
  return (
    <footer className="flex flex-wrap justify-between gap-2 border-t border-rule px-4 py-2 sm:px-6 console:border-hairline console:bg-panel dossier:border-t-2">
      <span className={LABEL}>Offline · the email stays in this tab · nothing stored</span>
      {SOURCE_URL && (
        <a className={`${LABEL} underline`} href={SOURCE_URL} target="_blank" rel="noreferrer">
          Source
        </a>
      )}
    </footer>
  );
}
