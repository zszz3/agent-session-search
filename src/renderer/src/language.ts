export type LanguageMode = "en" | "zh";

export const LANGUAGE_STORAGE_KEY = "agent-session-search-language";

export function readStoredLanguage(value: string | null): LanguageMode {
  return value === "zh" ? "zh" : "en";
}

export function readInitialLanguage(): LanguageMode {
  if (typeof window === "undefined") return "en";
  return readStoredLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

export function localize(language: LanguageMode, en: string, zh: string): string {
  return language === "zh" ? zh : en;
}
