import type { Text } from "./text.ts";

/** An error the page shows to the reader: `message` is the English text. */
export class TextError extends Error {
  readonly text: Text;

  constructor(text: Text) {
    super(text.en);
    this.text = text;
  }
}
