import type { LanguageMode } from "./language";

export type DateRangeFilter = "all" | "7d" | "30d" | "90d";

export interface DateRangeOption {
  value: DateRangeFilter;
  label: { en: string; zh: string };
  shortLabel: { en: string; zh: string };
}

export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { value: "all", label: { en: "All time", zh: "全部时间" }, shortLabel: { en: "All", zh: "全部" } },
  { value: "7d", label: { en: "Last 7 days", zh: "最近一周" }, shortLabel: { en: "7D", zh: "7天" } },
  { value: "30d", label: { en: "Last 30 days", zh: "最近一个月" }, shortLabel: { en: "30D", zh: "30天" } },
  { value: "90d", label: { en: "Last 3 months", zh: "最近三个月" }, shortLabel: { en: "90D", zh: "90天" } },
];

export function dateRangeLabel(value: DateRangeFilter, language: LanguageMode): string {
  const option = DATE_RANGE_OPTIONS.find((item) => item.value === value) ?? DATE_RANGE_OPTIONS[0];
  return language === "zh" ? option.label.zh : option.label.en;
}

export function dateRangeShortLabel(value: DateRangeFilter, language: LanguageMode): string {
  const option = DATE_RANGE_OPTIONS.find((item) => item.value === value) ?? DATE_RANGE_OPTIONS[0];
  return language === "zh" ? option.shortLabel.zh : option.shortLabel.en;
}

export function resolveDateRange(value: DateRangeFilter, now = Date.now()): { dateFrom?: number; dateTo?: number } {
  const days = value === "7d" ? 7 : value === "30d" ? 30 : value === "90d" ? 90 : null;
  if (!days) return {};
  return {
    dateFrom: now - days * 24 * 60 * 60 * 1000,
    dateTo: now,
  };
}
