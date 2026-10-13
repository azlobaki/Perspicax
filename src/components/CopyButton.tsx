"use client";

import { useState } from "react";
import { SMALL_BUTTON } from "./ui";

export default function CopyButton({ text, label = "Copy" }: { text: string | (() => string); label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={SMALL_BUTTON}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Clipboard refused (permissions, insecure context): the value stays selectable.
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
