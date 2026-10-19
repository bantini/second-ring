import { describe, expect, it } from "vitest";
import { DemoPhone } from "./adb/demo";
import { detectPhone } from "./device";
import { listsForPhone } from "./lists";
import { buildReport, reportFileName } from "./report";

describe("report", () => {
  it("records the phone, lists, apps, settings and finish, without a serial number", async () => {
    const phone = await detectPhone(new DemoPhone());
    const report = buildReport({
      phone,
      lists: listsForPhone(phone),
      apps: [{ id: "com.miui.msa.global", label: "MIUI system ads", outcome: "removed" }],
      settings: [{ id: "wifi-scanning", label: "Wi-Fi scanning off", outcome: "changed", previous: [] }],
      finish: { devOptionsOff: true, usbDebuggingOff: true },
      demo: true,
    });
    expect(report.lists).toEqual([
      { id: "xiaomi", version: 1, status: "untested" },
      { id: "common", version: 1, status: "untested" },
    ]);
    expect(report.apps).toHaveLength(1);
    expect(report.settings).toHaveLength(1);
    expect(report.finish).toEqual({ devOptionsOff: true, usbDebuggingOff: true });
    expect(report.phoneAfter).toBeNull();
    expect(JSON.stringify(report)).not.toContain("DEMO-0001");
  });

  it("names the file after the model and date", async () => {
    const phone = await detectPhone(new DemoPhone());
    expect(reportFileName(phone, new Date("2026-10-19T12:00:00Z"))).toBe("clean-report-redmi-note-7-pro-2026-10-19.json");
  });
});
