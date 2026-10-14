import type { Locale } from "@/lib/i18n/text";

const en = {
  topBar: {
    file: "File",
    sizeParse: "Size · parse",
    newEmail: "New email",
    settings: "Settings",
    theme: "Theme",
    language: "Language",
  },
};

export type Messages = typeof en;

// Same shape as `en`, enforced by the type: a missing or extra key fails `tsc`.
const fr: Messages = {
  topBar: {
    file: "Fichier",
    sizeParse: "Taille · analyse",
    newEmail: "Nouvel e-mail",
    settings: "Réglages",
    theme: "Thème",
    language: "Langue",
  },
};

export const messages: Record<Locale, Messages> = { en, fr };
