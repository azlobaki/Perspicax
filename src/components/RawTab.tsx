import { useLocale, useT } from "@/i18n/LocaleContext";
import { DATA } from "./ui";

// Rendering a multi-megabyte <pre> freezes the tab; the head of the file is what analysts read.
const LIMIT = 2_000_000;

export default function RawTab({ raw }: { raw: string }) {
  const t = useT();
  const locale = useLocale();
  const clipped = raw.length > LIMIT;
  return (
    <div>
      {clipped && (
        <p className="mb-2 text-muted">
          {t.raw.clipped(LIMIT.toLocaleString(locale), raw.length.toLocaleString(locale))}
        </p>
      )}
      <pre className={`${DATA} overflow-x-auto whitespace-pre-wrap break-all text-xs`}>
        {clipped ? raw.slice(0, LIMIT) : raw}
      </pre>
    </div>
  );
}
