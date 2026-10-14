"use client";

import { createContext, useContext } from "react";
import type { Locale, Text } from "@/lib/i18n/text";
import { messages, type Messages } from "./messages";

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): Locale => useContext(LocaleContext);
export const useT = (): Messages => messages[useContext(LocaleContext)];

/** Picks the current language out of an engine `Text`. */
export function usePick(): (text: Text) => string {
  const locale = useContext(LocaleContext);
  return (text) => text[locale];
}
