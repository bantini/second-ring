import type { PhoneShell } from "./adb/shell";
import { isValidPackageName } from "./packages";

/** Why an app has to stay on the phone. The on-screen text for each is in i18n.ts. */
export type KeepReason = "system" | "calls" | "google" | "web" | "keyboard" | "home" | "camera" | "permissions";

interface Rule {
  reason: KeepReason;
  exact?: readonly string[];
  prefixes?: readonly string[];
  contains?: readonly string[];
}

// Never removed, whatever a list says. Matching is deliberately broad: keeping an app by
// mistake costs a little memory, while removing one of these can break calls or startup.
const RULES: readonly Rule[] = [
  {
    reason: "system",
    exact: [
      "android",
      "com.android.systemui",
      "com.android.settings",
      "com.android.shell",
      "com.android.packageinstaller",
      "com.google.android.packageinstaller",
      "com.android.permissioncontroller",
      "com.google.android.permissioncontroller",
      "com.android.externalstorage",
      "com.android.documentsui",
      "com.google.android.documentsui",
      "com.android.keychain",
      "com.android.certinstaller",
      "com.android.location.fused",
      "com.android.bluetooth",
      "com.android.nfc",
      "com.android.se",
    ],
    prefixes: ["com.android.providers.", "com.android.networkstack", "com.google.android.networkstack", "com.android.wifi", "com.android.tethering"],
  },
  {
    reason: "calls",
    exact: [
      "com.android.phone",
      "com.android.server.telecom",
      "com.android.mms",
      "com.android.mms.service",
      "com.android.stk",
      "com.android.carrierconfig",
      "com.android.cellbroadcastreceiver",
      "com.google.android.cellbroadcastreceiver",
      "com.android.cellbroadcastservice",
      "com.google.android.cellbroadcastservice",
      "com.android.emergency",
      "com.android.dialer",
      "com.google.android.dialer",
      "com.android.incallui",
      "com.android.contacts",
      "com.google.android.contacts",
      "com.android.messaging",
      "com.google.android.apps.messaging",
    ],
    // IMS is what makes VoLTE calls work.
    prefixes: ["com.qualcomm.qti.ims", "org.codeaurora.ims", "com.mediatek.ims"],
    contains: ["telephony", "telecom", ".ims", "imsservice"],
  },
  {
    reason: "google",
    exact: ["com.google.android.gms", "com.google.android.gsf", "com.android.vending", "com.google.android.ext.services", "com.google.android.ext.shared"],
  },
  {
    reason: "web",
    exact: ["com.android.chrome"],
    prefixes: ["com.google.android.trichromelibrary"],
    contains: ["webview"],
  },
  { reason: "keyboard", contains: ["inputmethod"] },
  { reason: "home", contains: ["launcher"] },
  { reason: "camera", contains: ["camera"] },
  {
    reason: "permissions",
    exact: ["com.miui.securitycenter", "com.lbe.security.miui", "com.iqoo.secure", "com.vivo.permissionmanager", "com.coloros.safecenter", "com.coloros.securitypermission"],
  },
];

/** The reason an app must never be removed on any phone, or undefined if it may be. */
export function staticKeepReason(pkg: string): KeepReason | undefined {
  const lower = pkg.toLowerCase();
  for (const rule of RULES) {
    if (rule.exact?.includes(pkg)) return rule.reason;
    if (rule.prefixes?.some((prefix) => lower.startsWith(prefix))) return rule.reason;
    if (rule.contains?.some((part) => lower.includes(part))) return rule.reason;
  }
  return undefined;
}

export function keepReasonFor(pkg: string, phoneDefaults: ReadonlyMap<string, KeepReason>): KeepReason | undefined {
  return staticKeepReason(pkg) ?? phoneDefaults.get(pkg);
}

/**
 * The apps this particular phone relies on right now: its home screens, keyboards,
 * SMS app, phone app and WebView. Commands an older Android lacks just return an
 * error message, which the parsers ignore.
 */
export async function readPhoneDefaults(shell: PhoneShell): Promise<Map<string, KeepReason>> {
  const defaults = new Map<string, KeepReason>();
  const add = (reason: KeepReason, ids: readonly string[]) => {
    for (const id of ids) if (!defaults.has(id)) defaults.set(id, reason);
  };
  const home = ["cmd", "package", "query-activities", "--brief", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.HOME"];
  add("home", parseComponentPackages(await shell.run(home)));
  add("keyboard", parseComponentPackages(await shell.run(["settings", "get", "secure", "enabled_input_methods"])));
  add("keyboard", parseComponentPackages(await shell.run(["settings", "get", "secure", "default_input_method"])));
  add("calls", parsePlainPackages(await shell.run(["settings", "get", "secure", "sms_default_application"])));
  add("calls", parsePlainPackages(await shell.run(["telecom", "get-default-dialer"])));
  add("web", parseWebViewPackage(await shell.run(["dumpsys", "webviewupdate"])));
  return defaults;
}

/** Package names from "com.example/.Activity" components anywhere in the output. */
export function parseComponentPackages(output: string): string[] {
  const ids = [...output.matchAll(/([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)\/[A-Za-z0-9_.$]+/g)].map((match) => match[1]);
  return [...new Set(ids)];
}

/** Bare package names, e.g. from `settings get` ("null" when unset). */
export function parsePlainPackages(output: string): string[] {
  return output.split(/\s+/).filter(isValidPackageName);
}

export function parseWebViewPackage(output: string): string[] {
  const match = /Current WebView package \(name, version\): \(([^,\s)]+)/.exec(output);
  return match && isValidPackageName(match[1]) ? [match[1]] : [];
}
