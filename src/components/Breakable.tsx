import { Fragment } from "react";

/**
 * Lets hostnames, IPs, addresses and URLs wrap after a separator (`.`, `/`,
 * `?`, `&`, `=`, `:`, `@`, `#`) instead of in the middle of a word.
 */
export default function Breakable({ text }: { text: string }) {
  const pieces: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if ("./?&=:@#".includes(text[i])) {
      pieces.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  pieces.push(text.slice(start));
  return (
    <>
      {pieces.map((piece, i) => (
        <Fragment key={i}>
          {piece}
          {i < pieces.length - 1 && <wbr />}
        </Fragment>
      ))}
    </>
  );
}
