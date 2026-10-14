"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

/**
 * State backed by `localStorage`, safe for a statically exported page: the
 * first render always matches the prerendered HTML, and the stored value is
 * adopted right after hydration.
 *
 * `deserialize` receives the raw parsed JSON so callers can validate it; return
 * the fallback yourself if the shape is wrong.
 *
 * Nothing is written until the value is changed through the returned setter:
 * a visitor who changes nothing leaves nothing behind.
 */
export function useLocalStorage<T>(
  key: string,
  fallback: T,
  deserialize: (value: unknown) => T,
) {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const changedRef = useRef(false);
  // Pinned on purpose: the stored value is read once, with the validator the
  // hook was first given.
  const deserializeRef = useRef(deserialize);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(deserializeRef.current(JSON.parse(raw)));
    } catch {
      // Storage disabled, or leftover garbage under this key: keep the fallback.
    }
    loadedRef.current = true;
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    // Never write before the initial read, or the fallback would wipe the
    // user's saved data on the very first render.
    if (!loadedRef.current || !changedRef.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private mode or quota exceeded: the session still works, unsaved.
    }
  }, [key, value]);

  const update = useCallback((next: SetStateAction<T>) => {
    changedRef.current = true;
    setValue(next);
  }, []);

  return [value, update, loaded] as const;
}
