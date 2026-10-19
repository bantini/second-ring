import type { PhoneShell } from "./adb/shell";
import type { ListPackage, RemovalList } from "./lists";
import { firstLine } from "./output";
import { isValidPackageName, parsePackageList } from "./packages";
import { keepReasonFor, readPhoneDefaults, staticKeepReason, type KeepReason } from "./protect";

/** Where a listed app stands on this phone, for the main user (user 0). */
export type PackageState = "installed" | "disabled" | "removed" | "absent";

export interface PlanItem {
  pkg: ListPackage;
  listId: string;
  state: PackageState;
  /** Set when this phone needs the app, so it has to stay. */
  keep?: KeepReason;
}

export type Outcome = "removed" | "disabled" | "restored" | "failed" | "skipped";

export interface ActionResult {
  id: string;
  label: string;
  outcome: Outcome;
  /** The phone's own message, when it refused or something went wrong. */
  detail?: string;
}

/** `current` is the id of the app or setting being worked on, or "" when done. */
export type Progress = (done: number, total: number, current: string) => void;

export async function readPackageStates(shell: PhoneShell): Promise<(id: string) => PackageState> {
  const known = parsePackageList(await shell.run(["pm", "list", "packages", "-u", "--user", "0"]));
  const installed = parsePackageList(await shell.run(["pm", "list", "packages", "--user", "0"]));
  const disabled = parsePackageList(await shell.run(["pm", "list", "packages", "-d", "--user", "0"]));
  return (id) => {
    if (installed.has(id)) return disabled.has(id) ? "disabled" : "installed";
    return known.has(id) ? "removed" : "absent";
  };
}

/** Every app on the lists, once each, with its state on this phone and whether it must stay. */
export async function buildPlan(shell: PhoneShell, lists: readonly RemovalList[]): Promise<PlanItem[]> {
  const stateOf = await readPackageStates(shell);
  const defaults = await readPhoneDefaults(shell);
  return uniquePackages(lists).map(({ pkg, listId }) => ({
    pkg,
    listId,
    state: stateOf(pkg.id),
    keep: keepReasonFor(pkg.id, defaults),
  }));
}

export function isRemovable(item: PlanItem): boolean {
  return !item.keep && (item.state === "installed" || item.state === "disabled");
}

/**
 * Removes apps for the main user. Their files stay in the phone's read-only system
 * storage, so restorePackages or a factory reset brings them back. If the phone
 * refuses to remove an app, it is turned off instead.
 */
export async function removePackages(shell: PhoneShell, items: readonly PlanItem[], onProgress?: Progress): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  for (const [index, item] of items.entries()) {
    const { id, label } = item.pkg;
    onProgress?.(index, items.length, id);
    // Checked again here, not only in the UI, so no path can remove a protected app
    // or pass an unsafe string to the phone's shell.
    if (!isValidPackageName(id) || staticKeepReason(id) || !isRemovable(item)) {
      results.push({ id, label, outcome: "skipped" });
      continue;
    }
    const uninstall = await shell.run(["pm", "uninstall", "--user", "0", id]);
    if (/^Success/m.test(uninstall)) {
      results.push({ id, label, outcome: "removed" });
      continue;
    }
    const disable = await shell.run(["pm", "disable-user", "--user", "0", id]);
    if (/new state: disabled-user/.test(disable)) {
      results.push({ id, label, outcome: "disabled", detail: firstLine(uninstall) });
    } else {
      results.push({ id, label, outcome: "failed", detail: firstLine(disable) || firstLine(uninstall) });
    }
  }
  onProgress?.(items.length, items.length, "");
  return results;
}

/** Brings back every app on these lists that is currently removed or turned off. */
export async function restorePackages(shell: PhoneShell, lists: readonly RemovalList[], onProgress?: Progress): Promise<ActionResult[]> {
  const stateOf = await readPackageStates(shell);
  const targets = uniquePackages(lists)
    .map(({ pkg }) => ({ pkg, state: stateOf(pkg.id) }))
    .filter(({ pkg, state }) => isValidPackageName(pkg.id) && (state === "removed" || state === "disabled"));

  const results: ActionResult[] = [];
  for (const [index, { pkg, state }] of targets.entries()) {
    onProgress?.(index, targets.length, pkg.id);
    const output =
      state === "removed"
        ? await shell.run(["pm", "install-existing", "--user", "0", pkg.id])
        : await shell.run(["pm", "enable", "--user", "0", pkg.id]);
    const ok = state === "removed" ? /installed for user/i.test(output) : /new state: enabled/.test(output);
    results.push({ id: pkg.id, label: pkg.label, outcome: ok ? "restored" : "failed", detail: ok ? undefined : firstLine(output) });
  }
  onProgress?.(targets.length, targets.length, "");
  return results;
}

function uniquePackages(lists: readonly RemovalList[]): { pkg: ListPackage; listId: string }[] {
  const seen = new Set<string>();
  const unique: { pkg: ListPackage; listId: string }[] = [];
  for (const list of lists) {
    for (const pkg of list.packages) {
      if (seen.has(pkg.id)) continue;
      seen.add(pkg.id);
      unique.push({ pkg, listId: list.id });
    }
  }
  return unique;
}
