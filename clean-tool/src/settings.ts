import type { PhoneShell } from "./adb/shell";
import type { Progress } from "./cleaner";
import { STRINGS, stringsFor, type Lang } from "./i18n";
import { firstLine } from "./output";

export type Namespace = "system" | "secure" | "global";

interface SettingChange {
  namespace: Namespace;
  key: string;
  value: string;
  /** "atMost": a lower number already counts as done, e.g. a shorter screen timeout. */
  mode?: "exact" | "atMost";
}

export type SettingId =
  | "animations"
  | "screen-timeout"
  | "auto-brightness"
  | "battery-saver"
  | "adaptive-battery"
  | "wifi-scanning"
  | "bluetooth-scanning"
  | "mobile-data-always-on"
  | "stay-awake"
  | "always-on-display";

/** A battery or speed setting. Its label and reason are in each language's strings file. */
export interface PowerSetting {
  id: SettingId;
  changes: readonly SettingChange[];
}

// Ordinary Android settings, chosen to save battery or make an old phone feel faster
// without hiding notifications. Anyone can change them back in Settings.
export const POWER_SETTINGS: readonly PowerSetting[] = [
  {
    id: "animations",
    changes: [
      { namespace: "global", key: "window_animation_scale", value: "0.5", mode: "atMost" },
      { namespace: "global", key: "transition_animation_scale", value: "0.5", mode: "atMost" },
      { namespace: "global", key: "animator_duration_scale", value: "0.5", mode: "atMost" },
    ],
  },
  {
    id: "screen-timeout",
    changes: [{ namespace: "system", key: "screen_off_timeout", value: "60000", mode: "atMost" }],
  },
  {
    id: "auto-brightness",
    changes: [{ namespace: "system", key: "screen_brightness_mode", value: "1" }],
  },
  {
    id: "battery-saver",
    changes: [{ namespace: "global", key: "low_power_trigger_level", value: "20" }],
  },
  {
    id: "adaptive-battery",
    changes: [{ namespace: "global", key: "adaptive_battery_management_enabled", value: "1" }],
  },
  {
    id: "wifi-scanning",
    changes: [{ namespace: "global", key: "wifi_scan_always_enabled", value: "0" }],
  },
  {
    id: "bluetooth-scanning",
    changes: [{ namespace: "global", key: "ble_scan_always_enabled", value: "0" }],
  },
  {
    id: "mobile-data-always-on",
    changes: [{ namespace: "global", key: "mobile_data_always_on", value: "0" }],
  },
  {
    id: "stay-awake",
    changes: [{ namespace: "global", key: "stay_on_while_plugged_in", value: "0" }],
  },
  {
    id: "always-on-display",
    changes: [{ namespace: "secure", key: "doze_always_on", value: "0" }],
  },
];

/** A setting's label and reason in the chosen language, or undefined for an unknown id. */
export function settingText(id: string, lang: Lang): { label: string; why: string } | undefined {
  const known = POWER_SETTINGS.some((setting) => setting.id === id);
  return known ? stringsFor(lang).settings[id as SettingId] : undefined;
}

export interface SettingStatus {
  setting: PowerSetting;
  alreadySet: boolean;
}

export interface PreviousValue {
  namespace: Namespace;
  key: string;
  /** "null" when the phone had no value of its own. */
  value: string;
}

export type SettingOutcome = "changed" | "already" | "restored" | "failed";

export interface SettingResult {
  id: string;
  /** English, for the report. The screen looks the setting up by id. */
  label: string;
  outcome: SettingOutcome;
  /** The phone's own message, or "key = value it kept", when it refused. */
  detail?: string;
  /** Values from before this tool changed them, so Undo can put them back. */
  previous: PreviousValue[];
}

export interface FinishResult {
  devOptionsOff: boolean;
  usbDebuggingOff: boolean;
  /** The phone's own message, when it refused. */
  detail?: string;
}

// Values read back from the phone are passed to its shell on Undo, so anything
// outside this set is refused rather than quoted.
const SAFE_VALUE = /^[A-Za-z0-9._:-]+$/;
const SAFE_KEY = /^[a-z_]+$/;
const NAMESPACES: readonly string[] = ["system", "secure", "global"];

export async function readSetting(shell: PhoneShell, namespace: Namespace, key: string): Promise<string> {
  return (await shell.run(["settings", "get", namespace, key])).trim();
}

function isSatisfied(change: SettingChange, current: string): boolean {
  const now = Number(current);
  const target = Number(change.value);
  const numeric = current !== "" && Number.isFinite(now) && Number.isFinite(target);
  if (change.mode === "atMost") return numeric && now <= target;
  return numeric ? now === target : current === change.value;
}

export async function readSettingStatuses(shell: PhoneShell, settings: readonly PowerSetting[] = POWER_SETTINGS): Promise<SettingStatus[]> {
  const statuses: SettingStatus[] = [];
  for (const setting of settings) {
    let alreadySet = true;
    for (const change of setting.changes) {
      if (!isSatisfied(change, await readSetting(shell, change.namespace, change.key))) alreadySet = false;
    }
    statuses.push({ setting, alreadySet });
  }
  return statuses;
}

/** Applies each setting, reads it back to confirm, and records the old values for Undo. */
export async function applySettings(shell: PhoneShell, settings: readonly PowerSetting[], onProgress?: Progress): Promise<SettingResult[]> {
  const results: SettingResult[] = [];
  for (const [index, setting] of settings.entries()) {
    onProgress?.(index, settings.length, setting.id);
    const previous: PreviousValue[] = [];
    let problem: string | undefined;
    for (const change of setting.changes) {
      const current = await readSetting(shell, change.namespace, change.key);
      if (isSatisfied(change, current)) continue;
      const output = await shell.run(["settings", "put", change.namespace, change.key, change.value]);
      const after = await readSetting(shell, change.namespace, change.key);
      if (isSatisfied(change, after)) {
        previous.push({ namespace: change.namespace, key: change.key, value: current });
      } else {
        problem ??= firstLine(output) || `${change.key} = ${after}`;
      }
    }
    const outcome = problem ? "failed" : previous.length > 0 ? "changed" : "already";
    results.push({ id: setting.id, label: STRINGS.en.settings[setting.id].label, outcome, detail: problem, previous });
  }
  onProgress?.(settings.length, settings.length, "");
  return results;
}

/** Puts back the values recorded by applySettings. Settings that had no value of their own are deleted again. */
export async function restoreSettings(shell: PhoneShell, applied: readonly SettingResult[], onProgress?: Progress): Promise<SettingResult[]> {
  const targets = applied.filter((result) => result.previous.length > 0);
  const results: SettingResult[] = [];
  for (const [index, result] of targets.entries()) {
    onProgress?.(index, targets.length, result.id);
    let problem: string | undefined;
    for (const { namespace, key, value } of result.previous) {
      const safe = NAMESPACES.includes(namespace) && SAFE_KEY.test(key) && (value === "null" || SAFE_VALUE.test(value));
      if (!safe) {
        problem ??= key;
        continue;
      }
      const output =
        value === "null"
          ? await shell.run(["settings", "delete", namespace, key])
          : await shell.run(["settings", "put", namespace, key, value]);
      const after = await readSetting(shell, namespace, key);
      if (after !== value) problem ??= firstLine(output) || `${key} = ${after}`;
    }
    results.push({ id: result.id, label: result.label, outcome: problem ? "failed" : "restored", detail: problem, previous: [] });
  }
  onProgress?.(targets.length, targets.length, "");
  return results;
}

/**
 * Hides developer options, then turns off USB debugging. UPI apps refuse to open
 * while either is on. Turning off USB debugging ends this connection, so it must be
 * the last command; success is the phone disconnecting within `waitMs`.
 */
export async function turnOffDeveloperOptions(shell: PhoneShell, waitMs = 5000): Promise<FinishResult> {
  const hide = await shell.run(["settings", "put", "global", "development_settings_enabled", "0"]);
  const devOptionsOff = (await readSetting(shell, "global", "development_settings_enabled")) === "0";
  if (!devOptionsOff) {
    return { devOptionsOff, usbDebuggingOff: false, detail: firstLine(hide) || undefined };
  }

  void shell.run(["settings", "put", "global", "adb_enabled", "0"]).catch(() => undefined);
  const usbDebuggingOff = await Promise.race([shell.disconnected.then(() => true), sleep(waitMs).then(() => false)]);
  return { devOptionsOff, usbDebuggingOff };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
