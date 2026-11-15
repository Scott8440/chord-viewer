/** Escapes text for HTML: element content and attribute values (double- or single-quoted) */
export function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
