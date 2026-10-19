import { describe, expect, it } from "vitest";
import { DemoPhone } from "./adb/demo";
import { detectPhone, detectSkin, parseBatteryLevel, parseDfAvailableMb, parseGetprop, parseMeminfo } from "./device";

describe("parseGetprop", () => {
  it("reads [key]: [value] lines and ignores everything else", () => {
    const props = parseGetprop("[ro.product.brand]: [Redmi]\r\n[ro.build.version.sdk]: [29]\nnoise\n[empty]: []\n");
    expect(props.get("ro.product.brand")).toBe("Redmi");
    expect(props.get("ro.build.version.sdk")).toBe("29");
    expect(props.get("empty")).toBe("");
    expect(props.size).toBe(3);
  });
});

describe("detectSkin", () => {
  it.each([
    [{ "ro.miui.ui.version.name": "V12" }, "MIUI V12"],
    [{ "ro.mi.os.version.name": "OS1.0", "ro.miui.ui.version.name": "V816" }, "HyperOS 1.0"],
    [{ "ro.build.version.oneui": "30100" }, "One UI 3.1"],
    [{ "ro.build.version.oplusrom": "V11.1" }, "ColorOS V11.1"],
    [{ "ro.vivo.os.version": "11" }, "Funtouch OS 11"],
    [{}, undefined],
  ])("%o is %s", (props, expected) => {
    expect(detectSkin(new Map(Object.entries(props)))).toBe(expected);
  });
});

describe("parseMeminfo", () => {
  it("converts kB to MB", () => {
    expect(parseMeminfo("MemTotal:        3932160 kB\nMemFree:  1 kB\nMemAvailable:    1228800 kB\n")).toEqual({
      totalMb: 3840,
      availableMb: 1200,
    });
  });

  it("leaves out what it can't find", () => {
    expect(parseMeminfo("permission denied")).toEqual({ totalMb: undefined, availableMb: undefined });
  });
});

describe("parseDfAvailableMb", () => {
  it("reads toybox output in 1K blocks", () => {
    const output = "Filesystem       1K-blocks     Used Available Use% Mounted on\n/dev/block/dm-2   52367220 30000000  22367220  58% /data\n";
    expect(parseDfAvailableMb(output)).toBe(21843);
  });

  it("reads the older human-readable format", () => {
    const output = "Filesystem               Size     Used     Free   Blksize\n/data                   25.0G     3.2G    21.8G   4096\n";
    expect(parseDfAvailableMb(output)).toBe(22323);
  });

  it("gives up on anything else", () => {
    expect(parseDfAvailableMb("df: /data: Permission denied")).toBeUndefined();
  });
});

describe("parseBatteryLevel", () => {
  it("reads the level line", () => {
    expect(parseBatteryLevel("Current Battery Service state:\n  AC powered: false\n  level: 78\n  scale: 100\n")).toBe(78);
    expect(parseBatteryLevel("")).toBeUndefined();
  });
});

describe("detectPhone", () => {
  it("collects everything from the demo phone", async () => {
    const phone = await detectPhone(new DemoPhone());
    expect(phone).toMatchObject({
      brand: "Xiaomi",
      model: "Redmi Note 7 Pro",
      androidVersion: "10",
      sdk: 29,
      skin: "MIUI V12",
      ramTotalMb: 3840,
      batteryPercent: 78,
    });
    expect(phone.storageFreeMb).toBeGreaterThan(0);
  });
});
