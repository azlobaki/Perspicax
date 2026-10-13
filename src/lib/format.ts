/** `2026-10-13 07:14:01 UTC`: one unambiguous form for every analyst, whatever their locale. */
export function formatUtc(date: Date): string {
  return `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

export function formatTime(date: Date): string {
  return `${date.toISOString().slice(11, 19)}Z`;
}

export function formatDelay(seconds: number | null): string {
  if (seconds === null) return "—";
  const sign = seconds < 0 ? "−" : "+";
  const abs = Math.abs(seconds);
  if (abs < 120) return `${sign}${abs} s`;
  if (abs < 7200) return `${sign}${Math.round(abs / 60)} min`;
  return `${sign}${Math.round(abs / 3600)} h`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
