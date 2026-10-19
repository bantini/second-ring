import { bn } from "./locales/bn";
import { mr } from "./locales/mr";
import { gu } from "./locales/gu";
import { ta } from "./locales/ta";
import { te } from "./locales/te";
import { kn } from "./locales/kn";
import { ml } from "./locales/ml";
import { ur } from "./locales/ur";
import { en, type Strings } from "./locales/en";
import { hi } from "./locales/hi";

export type { Strings };

export type Lang = "en" | "hi" | "bn" | "mr" | "gu" | "ta" | "te" | "kn" | "ml" | "ur";

export interface LanguageInfo {
  code: Lang;
  /** The language's name in its own script, for the language menu. */
  name: string;
  dir: "ltr" | "rtl";
  /** A character of the language's script. Tests use it to catch text left untranslated. */
  script: RegExp;
}

/** Languages the page offers, in menu order. A language appears once its strings exist. */
export const LANGUAGES: readonly LanguageInfo[] = [
  { code: "en", name: "English", dir: "ltr", script: /[A-Za-z]/ },
  { code: "hi", name: "हिन्दी", dir: "ltr", script: /[ऀ-ॿ]/ },
  { code: "bn", name: "বাংলা", dir: "ltr", script: /[ঀ-৿]/ },
  { code: "mr", name: "मराठी", dir: "ltr", script: /[ऀ-ॿ]/ },
  { code: "gu", name: "ગુજરાતી", dir: "ltr", script: /[઀-૿]/ },
  { code: "ta", name: "தமிழ்", dir: "ltr", script: /[஀-௿]/ },
  { code: "te", name: "తెలుగు", dir: "ltr", script: /[ఀ-౿]/ },
  { code: "kn", name: "ಕನ್ನಡ", dir: "ltr", script: /[ಀ-೿]/ },
  { code: "ml", name: "മലയാളം", dir: "ltr", script: /[ഀ-ൿ]/ },
  { code: "ur", name: "اردو", dir: "rtl", script: /[؀-ۿ]/ },
];

export const STRINGS: Partial<Record<Lang, Strings>> & Record<"en", Strings> = { en, hi, bn, mr, gu, ta, te, kn, ml, ur };

export const LANGS: readonly Lang[] = LANGUAGES.map((language) => language.code);

export function languageInfo(lang: Lang): LanguageInfo {
  return LANGUAGES.find((language) => language.code === lang) ?? LANGUAGES[0];
}

/** The strings for a language, falling back to English if it isn't available. */
export function stringsFor(lang: Lang): Strings {
  return STRINGS[lang] ?? STRINGS.en;
}

/**
 * The language to start in: the saved choice, else the first of the browser's
 * preferred languages that the page offers, else English.
 */
export function pickLanguage(saved: string | null, browserLanguages: readonly string[]): Lang {
  if (saved && LANGS.includes(saved as Lang)) return saved as Lang;
  for (const language of browserLanguages) {
    const code = language.split("-")[0].toLowerCase();
    if (LANGS.includes(code as Lang)) return code as Lang;
  }
  return "en";
}
