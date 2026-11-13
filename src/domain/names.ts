/** `base`, or `base 2`, `base 3`… when that is taken (compared ignoring case and spaces at the ends). */
export function uniqueName(base: string, taken: readonly string[]): string {
  const key = (s: string) => s.trim().toLowerCase();
  const used = new Set(taken.map(key));
  const b = base.trim();
  if (!used.has(key(b))) return b;
  for (let n = 2; ; n++) if (!used.has(key(`${b} ${n}`))) return `${b} ${n}`;
}

/** First letter in capitals: "tube" becomes "Tube". */
export const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
