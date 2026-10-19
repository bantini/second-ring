import common from "../lists/common.json";
import oppoRealme from "../lists/oppo-realme.json";
import samsung from "../lists/samsung.json";
import bnText from "../lists/translations/bn.json";
import guText from "../lists/translations/gu.json";
import hiText from "../lists/translations/hi.json";
import knText from "../lists/translations/kn.json";
import mlText from "../lists/translations/ml.json";
import mrText from "../lists/translations/mr.json";
import taText from "../lists/translations/ta.json";
import teText from "../lists/translations/te.json";
import urText from "../lists/translations/ur.json";
import vivo from "../lists/vivo.json";
import xiaomi from "../lists/xiaomi.json";
import type { Lang } from "./i18n";
import { isValidPackageName } from "./packages";
import { staticKeepReason } from "./protect";

export interface ListPackage {
  id: string;
  /** English. Other languages are in lists/translations/<lang>.json. */
  label: string;
  /** Why it's safe and worth removing, in plain words. */
  why: string;
}

export interface TestRecord {
  model: string;
  android: string;
  date: string;
}

export interface RemovalList {
  id: string;
  version: number;
  name: string;
  /** "tested" only once volunteers confirmed phones still work after every removal in it. */
  status: "tested" | "untested";
  testedOn: TestRecord[];
  /** Lower-case brand or manufacturer names as Android reports them; "*" matches every phone. */
  brands: string[];
  packages: ListPackage[];
}

/**
 * One language's text for the bundled lists: each list's name, and each app's reason.
 * An app's label is only given where it differs from the English one, since most are brand names.
 */
export interface ListTranslation {
  lists: Record<string, string>;
  packages: Record<string, { label?: string; why: string }>;
}

/** Checks a list file and returns it typed, or throws naming the problem. */
export function validateList(raw: unknown): RemovalList {
  const list = (raw ?? {}) as Partial<RemovalList>;
  const where = `Removal list "${String(list.id)}"`;
  function fail(problem: string): never {
    throw new Error(`${where}: ${problem}`);
  }

  if (typeof list.id !== "string" || !/^[a-z0-9-]+$/.test(list.id)) fail("id must be lower-case letters, digits and dashes");
  if (!Number.isInteger(list.version) || (list.version ?? 0) < 1) fail("version must be a whole number from 1");
  if (typeof list.name !== "string" || list.name === "") fail("name is missing");
  if (list.status !== "tested" && list.status !== "untested") fail('status must be "tested" or "untested"');
  if (!Array.isArray(list.testedOn)) fail("testedOn must be a list");
  if (list.status === "tested" && list.testedOn.length === 0) fail('a "tested" list must say which phones it was tested on');
  if (!Array.isArray(list.brands) || list.brands.length === 0 || list.brands.some((b) => typeof b !== "string" || b !== b.toLowerCase())) {
    fail("brands must be lower-case names");
  }
  if (!Array.isArray(list.packages) || list.packages.length === 0) fail("packages must be a non-empty list");

  const seen = new Set<string>();
  for (const pkg of list.packages) {
    if (typeof pkg?.id !== "string" || !isValidPackageName(pkg.id)) fail(`"${String(pkg?.id)}" is not a valid package name`);
    if (seen.has(pkg.id)) fail(`${pkg.id} is listed twice`);
    seen.add(pkg.id);
    if (typeof pkg.label !== "string" || pkg.label === "" || typeof pkg.why !== "string" || pkg.why === "") {
      fail(`${pkg.id} needs a label and a why`);
    }
    const keep = staticKeepReason(pkg.id);
    if (keep) fail(`${pkg.id} must never be removed (${keep})`);
  }
  return list as RemovalList;
}

/** Checks a translation file against the lists it translates, or throws naming the problem. */
export function validateTranslation(raw: unknown, lists: readonly RemovalList[]): ListTranslation {
  const text = (raw ?? {}) as Partial<ListTranslation>;
  const isObject = (value: unknown) => typeof value === "object" && value !== null;
  if (!isObject(text.lists) || !isObject(text.packages)) throw new Error('A list translation needs "lists" and "packages"');

  const listIds = new Set(lists.map((list) => list.id));
  const packageIds = new Set(lists.flatMap((list) => list.packages.map((pkg) => pkg.id)));
  for (const [id, name] of Object.entries(text.lists!)) {
    if (!listIds.has(id)) throw new Error(`Translation for an unknown list "${id}"`);
    if (typeof name !== "string" || name === "") throw new Error(`Translation for list "${id}" is empty`);
  }
  for (const [id, entry] of Object.entries(text.packages!)) {
    if (!packageIds.has(id)) throw new Error(`Translation for an unknown app "${id}"`);
    if (typeof entry?.why !== "string" || entry.why === "") throw new Error(`Translation for ${id} needs a why`);
    if (entry.label !== undefined && (typeof entry.label !== "string" || entry.label === "")) {
      throw new Error(`Translation for ${id} has an empty label`);
    }
  }
  return text as ListTranslation;
}

export const BUNDLED_LISTS: readonly RemovalList[] = [xiaomi, samsung, vivo, oppoRealme, common].map(validateList);

export const LIST_TRANSLATIONS: Partial<Record<Lang, ListTranslation>> = {
  hi: validateTranslation(hiText, BUNDLED_LISTS),
  bn: validateTranslation(bnText, BUNDLED_LISTS),
  mr: validateTranslation(mrText, BUNDLED_LISTS),
  gu: validateTranslation(guText, BUNDLED_LISTS),
  ta: validateTranslation(taText, BUNDLED_LISTS),
  te: validateTranslation(teText, BUNDLED_LISTS),
  kn: validateTranslation(knText, BUNDLED_LISTS),
  ml: validateTranslation(mlText, BUNDLED_LISTS),
  ur: validateTranslation(urText, BUNDLED_LISTS),
};

/** An app's label and reason in the chosen language, falling back to English. */
export function packageText(pkg: ListPackage, lang: Lang): { label: string; why: string } {
  const text = LIST_TRANSLATIONS[lang]?.packages[pkg.id];
  return { label: text?.label ?? pkg.label, why: text?.why ?? pkg.why };
}

export function listName(list: RemovalList, lang: Lang): string {
  return LIST_TRANSLATIONS[lang]?.lists[list.id] ?? list.name;
}

/** The lists that apply to a phone: its brand's lists first, then the every-phone list. */
export function listsForPhone(
  phone: { brand: string; manufacturer: string },
  lists: readonly RemovalList[] = BUNDLED_LISTS,
): RemovalList[] {
  const names = new Set([phone.brand, phone.manufacturer].map((name) => name.trim().toLowerCase()));
  const everyPhone = (list: RemovalList) => list.brands.includes("*");
  const matching = lists.filter((list) => everyPhone(list) || list.brands.some((brand) => names.has(brand)));
  return [...matching.filter((list) => !everyPhone(list)), ...matching.filter(everyPhone)];
}
