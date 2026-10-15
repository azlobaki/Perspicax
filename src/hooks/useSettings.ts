"use client";

import { useEffect, useSyncExternalStore } from "react";
import { browserLanguages, detectLocale, isLocale, type Locale } from "@/lib/i18n/text";
import { DEFAULT_SETTINGS, SETTINGS_KEY, parseSettings, type Settings } from "@/lib/settings";
import { useLocalStorage } from "./useLocalStorage";

const noSubscription = () => () => {};
const bootLocale = (): Locale => {
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : "en";
};

/** Settings, plus their side effects on `<html>`: the theme and the language. */
export function useSettings() {
  const [settings, setSettings, loaded] = useLocalStorage<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS, parseSettings);
  const booted = useSyncExternalStore(noSubscription, bootLocale, () => "en" as Locale);
  const locale: Locale = loaded ? (settings.locale ?? detectLocale(browserLanguages(navigator))) : booted;

  useEffect(() => {
    // Until the stored value is read, the boot script's choice must stand.
    if (loaded) document.documentElement.dataset.theme = settings.theme;
  }, [loaded, settings.theme]);

  useEffect(() => {
    // Until the stored value is read, the boot script's `lang` must stand.
    if (!loaded) return;
    const root = document.documentElement;
    root.lang = locale;
    // French visitors' content is hidden until now (globals.css), so English never flashes.
    root.dataset.localeReady = "";
  }, [loaded, locale]);

  const setLocale = (next: Locale) => setSettings((s) => ({ ...s, locale: next }));
  return { settings, setSettings, loaded, locale, setLocale };
}
