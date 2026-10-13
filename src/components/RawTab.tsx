import { DATA } from "./ui";

// Rendering a multi-megabyte <pre> freezes the tab; the head of the file is what analysts read.
const LIMIT = 2_000_000;

export default function RawTab({ raw }: { raw: string }) {
  const clipped = raw.length > LIMIT;
  return (
    <div>
      {clipped && (
        <p className="mb-2 text-muted">
          Showing the first {LIMIT.toLocaleString("en")} of {raw.length.toLocaleString("en")} characters.
        </p>
      )}
      <pre className={`${DATA} overflow-x-auto whitespace-pre-wrap break-all text-xs`}>
        {clipped ? raw.slice(0, LIMIT) : raw}
      </pre>
    </div>
  );
}
