"use client";

import { useEffect } from "react";
import { DEFAULT_SETTINGS, SETTINGS_KEY, parseSettings, type Settings } from "@/lib/settings";
import { useLocalStorage } from "./useLocalStorage";

/** Settings, plus their one side effect: the theme lives on `<html data-theme>`. */
export function useSettings() {
  const [settings, setSettings, loaded] = useLocalStorage<Settings>(
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
    parseSettings,
  );

  useEffect(() => {
    // Until the stored value is read, the boot script's choice must stand.
    if (loaded) document.documentElement.dataset.theme = settings.theme;
  }, [loaded, settings.theme]);

  return { settings, setSettings, loaded };
}
