import { describe, expect, it } from "vitest";
import { DemoPhone } from "./adb/demo";
import { keepReasonFor, parseComponentPackages, parsePlainPackages, parseWebViewPackage, readPhoneDefaults, staticKeepReason } from "./protect";

describe("staticKeepReason", () => {
  it.each([
    ["com.android.phone", "calls"],
    ["com.qualcomm.qti.ims", "calls"],
    ["com.sec.imsservice", "calls"],
    ["com.android.providers.telephony", "system"],
    ["com.google.android.gms", "google"],
    ["com.google.android.webview", "web"],
    ["com.google.android.trichromelibrary_612345678", "web"],
    ["com.sec.android.app.launcher", "home"],
    ["com.android.camera", "camera"],
    ["com.miui.securitycenter", "permissions"],
  ])("keeps %s (%s)", (pkg, reason) => {
    expect(staticKeepReason(pkg)).toBe(reason);
  });

  it("allows ordinary bloatware", () => {
    expect(staticKeepReason("com.miui.msa.global")).toBeUndefined();
    expect(staticKeepReason("com.facebook.services")).toBeUndefined();
  });
});

describe("parsers", () => {
  it("finds packages in component names", () => {
    const query = "2 activities found:\n  com.miui.home/.launcher.Launcher\n  com.mi.android.globallauncher/com.miui.home.launcher.Launcher\n";
    expect(parseComponentPackages(query)).toEqual(["com.miui.home", "com.mi.android.globallauncher"]);
    expect(parseComponentPackages("a.b/.X;123:c.d/e.F")).toEqual(["a.b", "c.d"]);
    expect(parseComponentPackages("/system/bin/sh: cmd: not found")).toEqual([]);
  });

  it("finds bare package names and ignores null", () => {
    expect(parsePlainPackages("com.google.android.dialer\n")).toEqual(["com.google.android.dialer"]);
    expect(parsePlainPackages("null\n")).toEqual([]);
  });

  it("finds the WebView package", () => {
    expect(parseWebViewPackage("Current WebView package (name, version): (com.google.android.webview, 120.0)")).toEqual([
      "com.google.android.webview",
    ]);
    expect(parseWebViewPackage("Can't find service: webviewupdate")).toEqual([]);
  });
});

describe("readPhoneDefaults", () => {
  it("protects the apps this phone currently relies on", async () => {
    const defaults = await readPhoneDefaults(new DemoPhone());
    expect(Object.fromEntries(defaults)).toEqual({
      "com.miui.home": "home",
      "com.google.android.inputmethod.latin": "keyboard",
      "com.google.android.apps.messaging": "calls",
      "com.google.android.dialer": "calls",
      "com.google.android.webview": "web",
    });
    expect(keepReasonFor("com.miui.home", defaults)).toBe("home");
    expect(keepReasonFor("com.miui.player", defaults)).toBeUndefined();
  });
});
