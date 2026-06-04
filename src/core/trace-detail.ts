export const TRACE_DETAIL_PREVIEW_MAX_CHARS = 12_000;

export function truncateTraceDetail(detail: string, maxChars = TRACE_DETAIL_PREVIEW_MAX_CHARS): string {
  if (detail.length <= maxChars) return detail;
  if (maxChars <= 0) return "";

  const initialNotice = "\n\n[Indexed preview truncated]";
  if (maxChars <= initialNotice.length) return detail.slice(0, maxChars);

  let keepChars = maxChars - initialNotice.length;
  let notice = `\n\n[Indexed preview truncated: ${detail.length - keepChars} characters omitted]`;
  keepChars = Math.max(0, maxChars - notice.length);
  notice = `\n\n[Indexed preview truncated: ${detail.length - keepChars} characters omitted]`;

  return `${detail.slice(0, keepChars)}${notice}`;
}
