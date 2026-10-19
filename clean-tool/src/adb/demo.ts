import type { PhoneShell } from "./shell";

/**
 * A simulated Xiaomi phone, for trying the tool without a real phone and for tests.
 * It understands only the commands this tool sends, and its memory and storage
 * figures are made up.
 */

interface DemoPackage {
  /** Installed for the main user (user 0). */
  installed: boolean;
  enabled: boolean;
}

const PROPS: Record<string, string> = {
  "ro.product.brand": "Xiaomi",
  "ro.product.manufacturer": "Xiaomi",
  "ro.product.model": "Redmi Note 7 Pro",
  "ro.product.device": "violet",
  "ro.build.version.release": "10",
  "ro.build.version.sdk": "29",
  "ro.miui.ui.version.name": "V12",
};

const CORE_PACKAGES = [
  "android",
  "com.android.systemui",
  "com.android.settings",
  "com.android.phone",
  "com.android.server.telecom",
  "com.android.providers.telephony",
  "com.android.vending",
  "com.google.android.gms",
  "com.google.android.webview",
  "com.android.chrome",
  "com.google.android.inputmethod.latin",
  "com.google.android.apps.messaging",
  "com.google.android.dialer",
  "com.miui.home",
  "com.miui.securitycenter",
  "com.android.camera",
  "com.mi.android.globalFileexplorer",
  "com.xiaomi.midrop",
];

const BLOAT_PACKAGES = [
  "com.miui.msa.global",
  "com.miui.analytics",
  "com.xiaomi.mipicks",
  "com.xiaomi.glgm",
  "com.miui.videoplayer",
  "com.miui.player",
  "com.mi.globalbrowser",
  "com.miui.android.fashiongallery",
  "com.miui.hybrid",
  "com.miui.weather2",
  "com.facebook.appmanager",
  "com.facebook.services",
  "com.facebook.system",
  "com.netflix.partner.activation",
  "in.amazon.mShop.android.shopping",
  "com.eterno",
];

// "namespace key" → value. Anything missing reads as "null", as on a real phone.
const SETTINGS: Record<string, string> = {
  "secure default_input_method": "com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME",
  "secure enabled_input_methods": "com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME",
  "secure sms_default_application": "com.google.android.apps.messaging",
  "global window_animation_scale": "1.0",
  "global transition_animation_scale": "1.0",
  "global animator_duration_scale": "1.0",
  "system screen_off_timeout": "120000",
  "system screen_brightness_mode": "0",
  "global adaptive_battery_management_enabled": "1",
  "global wifi_scan_always_enabled": "1",
  "global ble_scan_always_enabled": "1",
  "global mobile_data_always_on": "1",
  "global stay_on_while_plugged_in": "0",
  "global development_settings_enabled": "1",
  "global adb_enabled": "1",
};

// What MIUI prints when "USB debugging (Security settings)" is off.
const SETTINGS_BLOCKED =
  "java.lang.SecurityException: Permission denial: writing to settings requires:android.permission.WRITE_SECURE_SETTINGS\n";

/** The phone refuses to remove this one, so the demo shows the "turned off instead" fallback. */
const UNREMOVABLE = "com.miui.analytics";
/** Already removed when the demo starts, so Undo has something to bring back. */
const ALREADY_REMOVED = "com.miui.weather2";

const TOTAL_RAM_KB = 3_932_160; // 3.75 GB
const BASE_FREE_RAM_KB = 1_228_800;
const BASE_FREE_STORAGE_KB = 21_400_000;
const DISK_KB = 52_367_220;

export interface DemoPhoneOptions {
  /** Pause before each answer, so progress bars are visible. */
  delayMs?: number;
  /** Refuse every settings change, like a Xiaomi phone without "USB debugging (Security settings)". */
  blockSettingChanges?: boolean;
}

export class DemoPhone implements PhoneShell {
  readonly serial = "DEMO-0001";
  readonly isDemo = true;
  readonly disconnected: Promise<void>;
  /** Every command received, for tests. */
  readonly commands: string[][] = [];
  readonly #packages = new Map<string, DemoPackage>();
  readonly #settings = new Map(Object.entries(SETTINGS));
  readonly #delayMs: number;
  readonly #blockSettingChanges: boolean;
  #isDisconnected = false;
  #resolveDisconnected: () => void = () => {};

  constructor({ delayMs = 0, blockSettingChanges = false }: DemoPhoneOptions = {}) {
    this.#delayMs = delayMs;
    this.#blockSettingChanges = blockSettingChanges;
    this.disconnected = new Promise((resolve) => {
      this.#resolveDisconnected = resolve;
    });
    for (const id of [...CORE_PACKAGES, ...BLOAT_PACKAGES]) {
      this.#packages.set(id, { installed: id !== ALREADY_REMOVED, enabled: true });
    }
  }

  async run(args: readonly string[]): Promise<string> {
    if (this.#isDisconnected) throw new Error("The phone is disconnected.");
    this.commands.push([...args]);
    if (this.#delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.#delayMs));
    return this.#respond(args);
  }

  async close(): Promise<void> {
    this.#disconnect();
  }

  #disconnect(): void {
    this.#isDisconnected = true;
    this.#resolveDisconnected();
  }

  #respond(args: readonly string[]): string {
    const command = args.join(" ");
    const target = args[args.length - 1] ?? "";
    const pkg = this.#packages.get(target);

    if (command === "getprop") {
      return Object.entries(PROPS).map(([key, value]) => `[${key}]: [${value}]\n`).join("");
    }
    if (command === "cat /proc/meminfo") {
      const free = BASE_FREE_RAM_KB + this.#appsOff() * 38 * 1024;
      return `MemTotal:        ${TOTAL_RAM_KB} kB\nMemFree:          201234 kB\nMemAvailable:    ${free} kB\n`;
    }
    if (command === "df /data") {
      const free = BASE_FREE_STORAGE_KB + this.#appsOff() * 45_000;
      return (
        "Filesystem       1K-blocks     Used Available Use% Mounted on\n" +
        `/dev/block/dm-2   ${DISK_KB} ${DISK_KB - free}  ${free}  59% /data\n`
      );
    }
    if (command === "dumpsys battery") {
      return "Current Battery Service state:\n  AC powered: false\n  USB powered: true\n  level: 78\n  scale: 100\n";
    }
    if (args[0] === "pm" && args[1] === "list" && args[2] === "packages") {
      return this.#listPackages(args.slice(3));
    }
    if (command === `pm uninstall --user 0 ${target}`) {
      if (!pkg?.installed) return "Failure [not installed for 0]\n";
      if (target === UNREMOVABLE) return "Failure [DELETE_FAILED_INTERNAL_ERROR]\n";
      pkg.installed = false;
      return "Success\n";
    }
    if (command === `pm disable-user --user 0 ${target}`) {
      if (!pkg?.installed) return `Error: Unknown package: ${target}\n`;
      pkg.enabled = false;
      return `Package ${target} new state: disabled-user\n`;
    }
    if (command === `pm enable --user 0 ${target}`) {
      if (!pkg?.installed) return `Error: Unknown package: ${target}\n`;
      pkg.enabled = true;
      return `Package ${target} new state: enabled\n`;
    }
    if (command === `pm install-existing --user 0 ${target}`) {
      if (!pkg) return `Package ${target} doesn't exist\n`;
      pkg.installed = true;
      return `Package ${target} installed for user: 0\n`;
    }
    if (command.startsWith("cmd package query-activities")) {
      return "1 activities found:\n  Activity #0:\n    priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=true\n    com.miui.home/.launcher.Launcher\n";
    }
    if (args[0] === "settings") return this.#runSettings(args.slice(1));
    if (command === "telecom get-default-dialer") return "com.google.android.dialer\n";
    if (command === "dumpsys webviewupdate") {
      return "Current WebView package (name, version): (com.google.android.webview, 120.0.6099.230)\n";
    }
    return `/system/bin/sh: ${args[0] ?? ""}: inaccessible or not found\n`;
  }

  #runSettings([verb, namespace, key, value]: readonly string[]): string {
    const name = `${namespace} ${key}`;
    if (verb === "get") return `${this.#settings.get(name) ?? "null"}\n`;
    if (verb !== "put" && verb !== "delete") return `Invalid command: ${verb}\n`;
    if (this.#blockSettingChanges) return SETTINGS_BLOCKED;
    if (verb === "delete") return `Deleted ${this.#settings.delete(name) ? 1 : 0} rows\n`;
    this.#settings.set(name, value ?? "");
    // Turning off USB debugging drops the connection, as on a real phone.
    if (name === "global adb_enabled" && value === "0") this.#disconnect();
    return "";
  }

  #listPackages(flags: readonly string[]): string {
    const includeRemoved = flags.includes("-u");
    const disabledOnly = flags.includes("-d");
    let output = "";
    for (const [id, pkg] of this.#packages) {
      if (!pkg.installed && !includeRemoved) continue;
      if (disabledOnly && (pkg.enabled || !pkg.installed)) continue;
      output += `package:${id}\n`;
    }
    return output;
  }

  #appsOff(): number {
    return [...this.#packages.values()].filter((pkg) => !pkg.installed || !pkg.enabled).length;
  }
}
