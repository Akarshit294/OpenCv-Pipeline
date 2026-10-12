/** A byte count a person can read: 230400 → "230.4 KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${Math.round(bytes)} bytes`;
}

/** A whole number with thousands separators: 921600 → "921,600". */
export function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}

/** The average of a list, or null when the list is empty. */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
