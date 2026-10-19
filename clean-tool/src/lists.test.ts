import { describe, expect, it } from "vitest";
import { LANGUAGES } from "./i18n";
import { BUNDLED_LISTS, LIST_TRANSLATIONS, listName, listsForPhone, packageText, validateList, validateTranslation } from "./lists";

const valid = {
  id: "test",
  version: 1,
  name: "Test",
  status: "untested",
  testedOn: [],
  brands: ["xiaomi"],
  packages: [{ id: "com.example.bloat", label: "Bloat", why: "Not needed" }],
};

describe("bundled lists", () => {
  it("all pass validation", () => {
    expect(BUNDLED_LISTS.map((list) => list.id)).toEqual(["xiaomi", "samsung", "vivo", "oppo-realme", "common"]);
  });

  it("don't name the same app twice across lists", () => {
    const ids = BUNDLED_LISTS.flatMap((list) => list.packages.map((pkg) => pkg.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(LANGUAGES.filter((language) => language.code !== "en"))("$name ($code) list text", (language) => {
  it("translates every list and every app", () => {
    const translation = LIST_TRANSLATIONS[language.code];
    expect(translation).toBeDefined();
    for (const list of BUNDLED_LISTS) {
      expect(translation?.lists[list.id], list.id).toBeTruthy();
      for (const pkg of list.packages) {
        // Labels are often brand names, but every reason should be translated.
        expect(packageText(pkg, language.code).why, pkg.id).toMatch(language.script);
      }
    }
  });
});

describe("list text", () => {
  it("falls back to English where a translation is missing", () => {
    const pkg = { id: "com.example.bloat", label: "Bloat", why: "Not needed" };
    expect(packageText(pkg, "hi")).toEqual({ label: "Bloat", why: "Not needed" });
    expect(listName(BUNDLED_LISTS[0], "en")).toBe(BUNDLED_LISTS[0].name);
  });

  it("keeps the English label when a translation gives only a reason", () => {
    const getApps = BUNDLED_LISTS[0].packages.find((pkg) => pkg.id === "com.xiaomi.mipicks")!;
    expect(packageText(getApps, "hi").label).toBe("GetApps");
  });
});

describe("validateList", () => {
  it("accepts a well-formed list", () => {
    expect(validateList(valid).id).toBe("test");
  });

  it.each([
    ["an unsafe package name", { packages: [{ id: "com.evil; reboot", label: "x", why: "x" }] }, "not a valid package name"],
    ["a protected app", { packages: [{ id: "com.android.phone", label: "Phone", why: "x" }] }, "must never be removed (calls)"],
    ["a duplicate", { packages: [valid.packages[0], valid.packages[0]] }, "listed twice"],
    ["a tested list with no test records", { status: "tested" }, "which phones it was tested on"],
    ["an upper-case brand", { brands: ["Xiaomi"] }, "lower-case"],
    ["a missing why", { packages: [{ id: "com.example.bloat", label: "Bloat", why: "" }] }, "needs a label and a why"],
  ])("rejects %s", (_name, change, message) => {
    expect(() => validateList({ ...valid, ...change })).toThrow(message);
  });
});

describe("validateTranslation", () => {
  const lists = [validateList(valid)];

  it("accepts a translation of known lists and apps", () => {
    const text = { lists: { test: "परीक्षण" }, packages: { "com.example.bloat": { why: "ज़रूरी नहीं" } } };
    expect(validateTranslation(text, lists)).toEqual(text);
  });

  it.each([
    ["missing sections", {}, '"lists" and "packages"'],
    ["an unknown list", { lists: { other: "x" }, packages: {} }, 'unknown list "other"'],
    ["an unknown app", { lists: {}, packages: { "com.other.app": { why: "x" } } }, 'unknown app "com.other.app"'],
    ["a missing why", { lists: {}, packages: { "com.example.bloat": { label: "x" } } }, "needs a why"],
  ])("rejects %s", (_name, text, message) => {
    expect(() => validateTranslation(text, lists)).toThrow(message);
  });
});

describe("listsForPhone", () => {
  it.each([
    [{ brand: "Redmi", manufacturer: "Xiaomi" }, ["xiaomi", "common"]],
    [{ brand: "POCO", manufacturer: "Xiaomi" }, ["xiaomi", "common"]],
    [{ brand: "vivo", manufacturer: "vivo" }, ["vivo", "common"]],
    [{ brand: "realme", manufacturer: "realme" }, ["oppo-realme", "common"]],
    [{ brand: "Nokia", manufacturer: "HMD Global" }, ["common"]],
  ])("%o gets %o", (phone, ids) => {
    expect(listsForPhone(phone).map((list) => list.id)).toEqual(ids);
  });
});
