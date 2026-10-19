import { describe, expect, it } from "vitest";
import { LANGUAGES, pickLanguage, STRINGS } from "./i18n";

// Entries that are rightly not in the language's own script.
const ANY_SCRIPT = new Set(["lang", "listJoin", "sentenceEnd"]);

/** Every piece of text in a strings object, with functions called on sample arguments. */
function texts(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") return [[path, String(value(3, 7))]];
  if (Array.isArray(value)) return value.flatMap((item, index) => texts(item, `${path}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => texts(item, path ? `${path}.${key}` : key));
  }
  return [];
}

const englishPaths = texts(STRINGS.en).map(([path]) => path);

describe.each(LANGUAGES.filter((language) => language.code !== "en"))("$name ($code) strings", (language) => {
  const strings = STRINGS[language.code];
  const all = texts(strings);

  it("exist and declare their language", () => {
    expect(strings?.lang).toBe(language.code);
  });

  it("cover every English string", () => {
    expect(all.map(([path]) => path)).toEqual(englishPaths);
  });

  it.each(all.filter(([path]) => !ANY_SCRIPT.has(path)))("%s is translated", (_path, text) => {
    expect(text).toMatch(language.script);
  });
});

describe("pickLanguage", () => {
  it("uses a saved choice first", () => {
    expect(pickLanguage("hi", ["en-US"])).toBe("hi");
    expect(pickLanguage("en", ["hi-IN"])).toBe("en");
  });

  it("otherwise takes the browser's first supported language, defaulting to English", () => {
    expect(pickLanguage(null, ["hi-IN", "en"])).toBe("hi");
    expect(pickLanguage(null, ["en-IN", "hi"])).toBe("en");
    expect(pickLanguage(null, ["fr-FR", "hi"])).toBe("hi");
    expect(pickLanguage("xx", ["fr"])).toBe("en");
  });
});
