/** Absolute local timestamp for a stored ISO date. Falls back to the raw
 *  string rather than throwing on a value written by an older version. */
export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}
