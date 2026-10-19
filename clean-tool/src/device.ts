import type { PhoneShell } from "./adb/shell";

export interface PhoneInfo {
  brand: string;
  manufacturer: string;
  model: string;
  device: string;
  androidVersion: string;
  /** Android API level, e.g. 29 for Android 10. 0 when unknown. */
  sdk: number;
  /** The manufacturer's version of Android, e.g. "MIUI V12", when it can be identified. */
  skin?: string;
  ramTotalMb?: number;
  ramAvailableMb?: number;
  storageFreeMb?: number;
  batteryPercent?: number;
}

export async function detectPhone(shell: PhoneShell): Promise<PhoneInfo> {
  const props = parseGetprop(await shell.run(["getprop"]));
  const memory = parseMeminfo(await shell.run(["cat", "/proc/meminfo"]));
  return {
    brand: props.get("ro.product.brand") || "unknown",
    manufacturer: props.get("ro.product.manufacturer") || "unknown",
    model: props.get("ro.product.model") || "unknown",
    device: props.get("ro.product.device") || "unknown",
    androidVersion: props.get("ro.build.version.release") || "unknown",
    sdk: Number(props.get("ro.build.version.sdk")) || 0,
    skin: detectSkin(props),
    ramTotalMb: memory.totalMb,
    ramAvailableMb: memory.availableMb,
    storageFreeMb: parseDfAvailableMb(await shell.run(["df", "/data"])),
    batteryPercent: parseBatteryLevel(await shell.run(["dumpsys", "battery"])),
  };
}

/** Parses `getprop` output: one "[key]: [value]" per line. */
export function parseGetprop(output: string): Map<string, string> {
  const props = new Map<string, string>();
  for (const line of output.split("\n")) {
    const match = /^\[([^\]]+)\]: \[(.*)\]\s*$/.exec(line);
    if (match) props.set(match[1], match[2]);
  }
  return props;
}

export function detectSkin(props: Map<string, string>): string | undefined {
  const hyperOs = props.get("ro.mi.os.version.name");
  if (hyperOs) return `HyperOS ${hyperOs.replace(/^OS/, "")}`;
  const miui = props.get("ro.miui.ui.version.name");
  if (miui) return `MIUI ${miui}`;
  // Samsung encodes One UI 3.1 as 30100.
  const oneUi = Number(props.get("ro.build.version.oneui"));
  if (oneUi > 0) return `One UI ${Math.floor(oneUi / 10000)}.${Math.floor((oneUi % 10000) / 100)}`;
  const colorOs = props.get("ro.build.version.oplusrom") || props.get("ro.build.version.opporom");
  if (colorOs) return `ColorOS ${colorOs}`;
  const funtouch = props.get("ro.vivo.os.version");
  if (funtouch) return `Funtouch OS ${funtouch}`;
  return undefined;
}

export function parseMeminfo(output: string): { totalMb?: number; availableMb?: number } {
  const megabytes = (key: string): number | undefined => {
    const match = new RegExp(`^${key}:\\s+(\\d+) kB`, "m").exec(output);
    return match ? Math.round(Number(match[1]) / 1024) : undefined;
  };
  return { totalMb: megabytes("MemTotal"), availableMb: megabytes("MemAvailable") };
}

/**
 * Reads free space from `df /data`. Handles toybox's 1K-block columns (Android 7+)
 * and the older human-readable format ("21.8G").
 */
export function parseDfAvailableMb(output: string): number | undefined {
  const lines = output.trim().split("\n");
  const header = lines[0]?.trim().split(/\s+/) ?? [];
  const column = header.findIndex((name) => /^(Available|Avail|Free)$/i.test(name));
  const row = lines.find((line) => /\s\/data\s*$/.test(line)) ?? lines[1];
  const value = row?.trim().split(/\s+/)[column];
  if (column < 0 || value === undefined) return undefined;

  if (/^\d+$/.test(value)) return Math.round(Number(value) / 1024);
  const human = /^([\d.]+)([KMGT])$/i.exec(value);
  if (!human) return undefined;
  const perMb: Record<string, number> = { K: 1 / 1024, M: 1, G: 1024, T: 1024 * 1024 };
  return Math.round(Number(human[1]) * perMb[human[2].toUpperCase()]);
}

export function parseBatteryLevel(output: string): number | undefined {
  const match = /^\s*level:\s*(\d+)/m.exec(output);
  return match ? Number(match[1]) : undefined;
}
