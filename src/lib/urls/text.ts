const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"'`{}|\\^[\]]+/gi;

const count = (text: string, ch: string) => text.split(ch).length - 1;

/** Drops punctuation that ends a sentence rather than the URL; keeps balanced parentheses. */
function trimTrailing(url: string): string {
  let out = url;
  for (;;) {
    const last = out[out.length - 1];
    if (last !== undefined && ".,;:!?'\"»".includes(last)) {
      out = out.slice(0, -1);
    } else if (last === ")" && count(out, "(") < count(out, ")")) {
      out = out.slice(0, -1);
    } else {
      return out;
    }
  }
}

/** Links written out in a plain-text body. `www.` addresses get an `http://` scheme. */
export function findUrlsInText(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const url = trimTrailing(match[0]);
    urls.push(/^www\./i.test(url) ? `http://${url}` : url);
  }
  return urls;
}
