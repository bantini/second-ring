import { describe, expect, it } from "vitest";
import { DemoPhone } from "./adb/demo";
import { buildPlan, isRemovable, readPackageStates, removePackages, restorePackages, type PlanItem } from "./cleaner";
import { listsForPhone, validateList } from "./lists";

const xiaomiLists = listsForPhone({ brand: "Xiaomi", manufacturer: "Xiaomi" });

function find(plan: PlanItem[], id: string): PlanItem {
  const item = plan.find((candidate) => candidate.pkg.id === id);
  if (!item) throw new Error(`${id} is not in the plan`);
  return item;
}

function forged(id: string): PlanItem {
  return { pkg: { id, label: id, why: "test" }, listId: "test", state: "installed" };
}

describe("buildPlan", () => {
  it("records each listed app's state on the phone", async () => {
    const plan = await buildPlan(new DemoPhone(), xiaomiLists);
    expect(find(plan, "com.miui.msa.global")).toMatchObject({ state: "installed", keep: undefined });
    expect(find(plan, "com.miui.weather2").state).toBe("removed");
    expect(find(plan, "com.microsoft.skydrive").state).toBe("absent");
    expect(isRemovable(find(plan, "com.miui.msa.global"))).toBe(true);
    expect(isRemovable(find(plan, "com.miui.weather2"))).toBe(false);
  });

  it("keeps an app the phone is currently using, even if a list names it", async () => {
    const list = validateList({
      id: "test",
      version: 1,
      name: "Test",
      status: "untested",
      testedOn: [],
      brands: ["*"],
      packages: [{ id: "com.miui.home", label: "MIUI home screen", why: "test" }],
    });
    const plan = await buildPlan(new DemoPhone(), [list]);
    expect(find(plan, "com.miui.home")).toMatchObject({ state: "installed", keep: "home" });
    expect(isRemovable(find(plan, "com.miui.home"))).toBe(false);
  });
});

describe("removePackages", () => {
  it("removes apps, and turns off the ones the phone refuses to remove", async () => {
    const phone = new DemoPhone();
    const plan = await buildPlan(phone, xiaomiLists);
    const progress: number[] = [];
    const results = await removePackages(phone, plan.filter(isRemovable), (done) => progress.push(done));

    expect(results.find((r) => r.id === "com.miui.msa.global")?.outcome).toBe("removed");
    expect(results.find((r) => r.id === "com.miui.analytics")).toMatchObject({
      outcome: "disabled",
      detail: "Failure [DELETE_FAILED_INTERNAL_ERROR]",
    });
    expect(results.some((r) => r.outcome === "failed")).toBe(false);
    expect(progress.at(-1)).toBe(results.length);

    const stateOf = await readPackageStates(phone);
    expect(stateOf("com.miui.msa.global")).toBe("removed");
    expect(stateOf("com.miui.analytics")).toBe("disabled");
    expect(stateOf("com.miui.home")).toBe("installed");
  });

  it("never touches a protected app, even when asked to", async () => {
    const phone = new DemoPhone();
    const results = await removePackages(phone, [forged("com.android.phone")]);
    expect(results[0].outcome).toBe("skipped");
    expect(phone.commands).toEqual([]);
  });

  it("never sends an unsafe package name to the phone", async () => {
    const phone = new DemoPhone();
    const results = await removePackages(phone, [forged("com.evil; reboot")]);
    expect(results[0].outcome).toBe("skipped");
    expect(phone.commands).toEqual([]);
  });
});

describe("restorePackages", () => {
  it("brings back everything that was removed or turned off", async () => {
    const phone = new DemoPhone();
    const plan = await buildPlan(phone, xiaomiLists);
    await removePackages(phone, plan.filter(isRemovable));

    const results = await restorePackages(phone, xiaomiLists);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.outcome === "restored")).toBe(true);

    const stateOf = await readPackageStates(phone);
    for (const id of ["com.miui.msa.global", "com.miui.analytics", "com.miui.weather2"]) {
      expect(stateOf(id)).toBe("installed");
    }
  });
});
