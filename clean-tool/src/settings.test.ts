import { describe, expect, it } from "vitest";
import { DemoPhone } from "./adb/demo";
import {
  applySettings,
  POWER_SETTINGS,
  readSetting,
  readSettingStatuses,
  restoreSettings,
  turnOffDeveloperOptions,
  type SettingResult,
} from "./settings";

function settingsById(...ids: string[]) {
  return POWER_SETTINGS.filter((setting) => ids.includes(setting.id));
}

describe("readSettingStatuses", () => {
  it("marks settings the phone already has as done", async () => {
    const statuses = await readSettingStatuses(new DemoPhone());
    const alreadySet = statuses.filter((status) => status.alreadySet).map((status) => status.setting.id);
    expect(alreadySet).toEqual(["adaptive-battery", "stay-awake"]);
  });

  it("treats a shorter screen timeout than the target as done", async () => {
    const phone = new DemoPhone();
    await phone.run(["settings", "put", "system", "screen_off_timeout", "15000"]);
    const [status] = await readSettingStatuses(phone, settingsById("screen-timeout"));
    expect(status.alreadySet).toBe(true);
  });
});

describe("applySettings", () => {
  it("changes each setting, confirms it and remembers the old value", async () => {
    const phone = new DemoPhone();
    const results = await applySettings(phone, settingsById("animations", "always-on-display", "adaptive-battery"));

    expect(results.map((result) => [result.id, result.outcome])).toEqual([
      ["animations", "changed"],
      ["adaptive-battery", "already"],
      ["always-on-display", "changed"],
    ]);
    expect(results[0].previous).toHaveLength(3);
    expect(results[2].previous).toEqual([{ namespace: "secure", key: "doze_always_on", value: "null" }]);
    expect(await readSetting(phone, "global", "window_animation_scale")).toBe("0.5");
    expect(await readSetting(phone, "secure", "doze_always_on")).toBe("0");
  });

  it("reports the phone's refusal, as on Xiaomi without the security setting", async () => {
    const phone = new DemoPhone({ blockSettingChanges: true });
    const [result] = await applySettings(phone, settingsById("wifi-scanning"));
    expect(result.outcome).toBe("failed");
    expect(result.detail).toContain("SecurityException");
    expect(result.previous).toEqual([]);
  });
});

describe("restoreSettings", () => {
  it("puts old values back and deletes settings that had none", async () => {
    const phone = new DemoPhone();
    const applied = await applySettings(phone, settingsById("animations", "always-on-display"));
    const restored = await restoreSettings(phone, applied);

    expect(restored.map((result) => result.outcome)).toEqual(["restored", "restored"]);
    expect(await readSetting(phone, "global", "window_animation_scale")).toBe("1.0");
    expect(await readSetting(phone, "secure", "doze_always_on")).toBe("null");
  });

  it("refuses to send an unsafe old value to the phone", async () => {
    const phone = new DemoPhone();
    const forged: SettingResult = {
      id: "x",
      label: "x",
      outcome: "changed",
      previous: [{ namespace: "global", key: "wifi_scan_always_enabled", value: "1; reboot" }],
    };
    const [result] = await restoreSettings(phone, [forged]);
    expect(result.outcome).toBe("failed");
    expect(phone.commands.flat().some((arg) => arg.includes(";"))).toBe(false);
  });
});

describe("turnOffDeveloperOptions", () => {
  it("hides developer options, then turns off USB debugging, which disconnects the phone", async () => {
    const phone = new DemoPhone();
    const result = await turnOffDeveloperOptions(phone, 100);
    expect(result).toEqual({ devOptionsOff: true, usbDebuggingOff: true, detail: undefined });
    await expect(phone.run(["getprop"])).rejects.toThrow("disconnected");
    // USB debugging is the very last thing switched off.
    expect(phone.commands.at(-1)).toEqual(["settings", "put", "global", "adb_enabled", "0"]);
  });

  it("leaves USB debugging alone if the phone won't hide developer options", async () => {
    const phone = new DemoPhone({ blockSettingChanges: true });
    const result = await turnOffDeveloperOptions(phone, 100);
    expect(result.devOptionsOff).toBe(false);
    expect(result.usbDebuggingOff).toBe(false);
    expect(result.detail).toContain("SecurityException");
    expect(phone.commands.some((command) => command.includes("adb_enabled"))).toBe(false);
    expect(await phone.run(["getprop"])).toContain("ro.product.model");
  });
});
