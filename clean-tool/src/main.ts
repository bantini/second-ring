import "./style.css";
import { DemoPhone } from "./adb/demo";
import type { PhoneShell } from "./adb/shell";
import { ConnectError, connectUsbPhone, isWebUsbSupported } from "./adb/webusb";
import { buildPlan, isRemovable, removePackages, restorePackages, type ActionResult, type Outcome, type PlanItem } from "./cleaner";
import { detectPhone, type PhoneInfo } from "./device";
import { LANGUAGES, languageInfo, pickLanguage, stringsFor, type Lang, type Strings } from "./i18n";
import { listName, listsForPhone, packageText, type ListPackage, type RemovalList } from "./lists";
import { buildReport, reportFileName } from "./report";
import {
  applySettings,
  readSettingStatuses,
  restoreSettings,
  settingText,
  turnOffDeveloperOptions,
  type FinishResult,
  type SettingResult,
  type SettingStatus,
} from "./settings";

type Step = "connect" | "phone" | "plan" | "working" | "results" | "settings" | "finish" | "finished";
type Task = "remove" | "restore" | "settings" | "restore-settings";
/** On-screen text built when rendering, so it follows a language switch. */
type Text = (t: Strings) => string;

interface State {
  step: Step;
  busy: boolean;
  /** What the user should do right now, e.g. tap Allow on the phone. */
  message?: Text;
  /** Confirms that something worked, e.g. settings put back. */
  notice?: Text;
  error?: Text;
  shell?: PhoneShell;
  isDemo: boolean;
  /** The phone as it was when connected, for before/after figures. */
  phone?: PhoneInfo;
  phoneAfter?: PhoneInfo;
  lists: RemovalList[];
  untestedConfirmed: boolean;
  plan: PlanItem[];
  selected: Set<string>;
  task: Task;
  /** `current` is the id of the app or setting being worked on. */
  progress: { done: number; total: number; current: string };
  /** Results of the last app action, shown on screen. */
  results: ActionResult[];
  settingStatus: SettingStatus[];
  selectedSettings: Set<string>;
  /** Results of the last "Apply", shown on screen and used by Undo. */
  settingResults: SettingResult[];
  /** Everything done to this phone in this session, for the report. */
  appLog: ActionResult[];
  settingLog: SettingResult[];
  /** True while developer options are being turned off, when a disconnect is expected. */
  finishing: boolean;
  finish?: FinishResult;
}

function initialState(): State {
  return {
    step: "connect",
    busy: false,
    isDemo: false,
    lists: [],
    untestedConfirmed: false,
    plan: [],
    selected: new Set(),
    task: "remove",
    progress: { done: 0, total: 0, current: "" },
    results: [],
    settingStatus: [],
    selectedSettings: new Set(),
    settingResults: [],
    appLog: [],
    settingLog: [],
    finishing: false,
  };
}

class NoPhoneError extends Error {}

// ---- Language ----

const LANGUAGE_KEY = "clean-this-phone.language";
let lang: Lang = pickLanguage(readSavedLanguage(), navigator.languages ?? [navigator.language]);
let t: Strings = stringsFor(lang);

function readSavedLanguage(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
}

function setLanguage(next: Lang): void {
  lang = next;
  t = stringsFor(next);
  try {
    localStorage.setItem(LANGUAGE_KEY, next);
  } catch {
    // Private browsing or blocked storage: the choice just isn't remembered.
  }
  applyLanguageToDocument();
  update({});
}

function applyLanguageToDocument(): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = languageInfo(lang).dir;
  document.title = t.title;
}

const app = document.querySelector<HTMLElement>("#app")!;
let state = initialState();

function update(changes: Partial<State>): void {
  const stepChanged = changes.step !== undefined && changes.step !== state.step;
  state = { ...state, ...changes };
  app.innerHTML = render(state);
  if (stepChanged) window.scrollTo(0, 0);
}

// ---- Actions ----

async function attempt(action: () => Promise<void>): Promise<void> {
  if (state.busy) return;
  update({ busy: true, error: undefined, notice: undefined });
  try {
    await action();
  } catch (error) {
    update({ error: errorText(error), step: state.step === "working" ? stepAfterWork(state.task) : state.step });
  } finally {
    update({ busy: false, message: undefined });
  }
}

function stepAfterWork(task: Task): Step {
  return task === "settings" || task === "restore-settings" ? "settings" : "plan";
}

async function connectUsb(): Promise<void> {
  update({ message: (t) => t.msgChoosePhone });
  const shell = await connectUsbPhone(() => update({ message: (t) => t.msgAllow }));
  await onConnected(shell);
}

async function onConnected(shell: PhoneShell): Promise<void> {
  let phone: PhoneInfo;
  try {
    phone = await detectPhone(shell);
  } catch (error) {
    await shell.close().catch(() => undefined);
    throw error;
  }
  void shell.disconnected.then(() => {
    if (state.shell === shell && !state.finishing && state.step !== "finished") {
      update({ ...initialState(), error: (t) => t.errDisconnected });
    }
  });
  update({ step: "phone", shell, isDemo: shell.isDemo, phone, lists: listsForPhone(phone), untestedConfirmed: false });
}

async function showPlan(): Promise<void> {
  const plan = await buildPlan(requireShell(), state.lists);
  update({ step: "plan", plan, selected: new Set(plan.filter(isRemovable).map((item) => item.pkg.id)) });
}

async function removeSelected(): Promise<void> {
  const shell = requireShell();
  const items = state.plan.filter((item) => state.selected.has(item.pkg.id) && isRemovable(item));
  update({ step: "working", task: "remove", progress: { done: 0, total: items.length, current: "" } });
  const results = await removePackages(shell, items, onProgress);
  update({ step: "results", results, appLog: [...state.appLog, ...results], phoneAfter: await detectPhone(shell) });
}

async function restoreApps(): Promise<void> {
  const shell = requireShell();
  update({ step: "working", task: "restore", progress: { done: 0, total: 0, current: "" } });
  const results = await restorePackages(shell, state.lists, onProgress);
  update({ step: "results", results, appLog: [...state.appLog, ...results], phoneAfter: await detectPhone(shell) });
}

async function showSettings(): Promise<void> {
  const settingStatus = await readSettingStatuses(requireShell());
  update({
    step: "settings",
    settingStatus,
    selectedSettings: new Set(settingStatus.filter((status) => !status.alreadySet).map((status) => status.setting.id)),
    settingResults: [],
  });
}

async function applySelectedSettings(): Promise<void> {
  const shell = requireShell();
  const settings = state.settingStatus
    .filter((status) => !status.alreadySet && state.selectedSettings.has(status.setting.id))
    .map((status) => status.setting);
  update({ step: "working", task: "settings", progress: { done: 0, total: settings.length, current: "" } });
  const settingResults = await applySettings(shell, settings, onProgress);
  update({ step: "settings", settingResults, settingLog: [...state.settingLog, ...settingResults] });
}

async function undoSettings(): Promise<void> {
  const shell = requireShell();
  update({ step: "working", task: "restore-settings", progress: { done: 0, total: 0, current: "" } });
  const restored = await restoreSettings(shell, state.settingResults, onProgress);
  const failedIds = restored.filter((result) => result.outcome === "failed").map((result) => result.id);
  const settingLog = [...state.settingLog, ...restored];
  await showSettings();
  update({
    settingLog,
    notice: failedIds.length ? undefined : (t) => t.settingsRestored,
    error: failedIds.length
      ? (t) => t.settingsNotRestored(failedIds.map((id) => settingText(id, t.lang)?.label ?? id).join(t.listJoin))
      : undefined,
  });
}

async function finishUp(): Promise<void> {
  const shell = requireShell();
  update({ finishing: true, message: (t) => t.msgFinishing });
  try {
    const finish = await turnOffDeveloperOptions(shell);
    // Once USB debugging is off the connection is gone; keep it only if it's still up.
    update({ step: "finished", finish, shell: finish.usbDebuggingOff ? undefined : shell });
  } finally {
    update({ finishing: false });
  }
}

function onProgress(done: number, total: number, current: string): void {
  update({ progress: { done, total, current } });
}

function requireShell(): PhoneShell {
  if (!state.shell) throw new NoPhoneError();
  return state.shell;
}

function downloadReport(): void {
  if (!state.phone) return;
  const report = buildReport({
    phone: state.phone,
    phoneAfter: state.phoneAfter,
    lists: state.lists,
    apps: state.appLog,
    settings: state.settingLog,
    finish: state.finish,
    demo: state.isDemo,
  });
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFileName(state.phone);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function startOver(): Promise<void> {
  const shell = state.shell;
  update(initialState());
  await shell?.close().catch(() => undefined);
}

function errorText(error: unknown): Text {
  if (error instanceof ConnectError) {
    switch (error.reason) {
      case "no-webusb":
        return (t) => t.errNoWebUsb;
      case "cancelled":
        return (t) => t.errCancelled;
      case "busy":
        return (t) => t.errBusy;
    }
  }
  if (error instanceof NoPhoneError) return (t) => t.errNoPhone;
  const detail = error instanceof Error ? error.message : String(error);
  return (t) => t.errUnexpected(detail);
}

// ---- Events ----

const ACTIONS: Record<string, () => void> = {
  "connect-usb": () => void attempt(connectUsb),
  "connect-demo": () => void attempt(() => onConnected(new DemoPhone({ delayMs: 150 }))),
  "show-plan": () => void attempt(showPlan),
  remove: () => void attempt(removeSelected),
  restore: () => void attempt(restoreApps),
  "select-all": () => update({ selected: new Set(state.plan.filter(isRemovable).map((item) => item.pkg.id)) }),
  "select-none": () => update({ selected: new Set() }),
  "show-settings": () => void attempt(showSettings),
  "apply-settings": () => void attempt(applySelectedSettings),
  "undo-settings": () => void attempt(undoSettings),
  "go-finish": () => update({ step: "finish", error: undefined, notice: undefined }),
  "finish-up": () => void attempt(finishUp),
  "download-report": downloadReport,
  "start-over": () => void startOver(),
};

app.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action]");
  if (button && !button.disabled) ACTIONS[button.dataset.action ?? ""]?.();
});

// Checkboxes update the state without a full re-render, so focus and scroll stay put.
app.addEventListener("change", (event) => {
  if (event.target instanceof HTMLSelectElement && event.target.dataset.language !== undefined) {
    const next = event.target.value as Lang;
    if (LANGUAGES.some((language) => language.code === next)) setLanguage(next);
    return;
  }
  const input = event.target as HTMLInputElement;
  if (input.dataset.pkg) {
    const selected = toggled(state.selected, input.dataset.pkg, input.checked);
    state = { ...state, selected };
    refreshButton("remove", selected.size === 0, t.removeApps(selected.size));
  } else if (input.dataset.setting) {
    const selectedSettings = toggled(state.selectedSettings, input.dataset.setting, input.checked);
    state = { ...state, selectedSettings };
    refreshButton("apply-settings", selectedSettings.size === 0, t.applySettings(selectedSettings.size));
  } else if (input.id === "confirm-untested") {
    state = { ...state, untestedConfirmed: input.checked };
    refreshButton("show-plan", !canContinue(state));
  }
});

function toggled(set: ReadonlySet<string>, id: string, on: boolean): Set<string> {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

function refreshButton(action: string, disabled: boolean, label?: string): void {
  const button = app.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!button) return;
  button.disabled = disabled;
  if (label) button.textContent = label;
}

window.addEventListener("beforeunload", (event) => {
  if (state.step === "working" || state.finishing) event.preventDefault();
});

// ---- Rendering ----

function render(s: State): string {
  return `
    <header class="top">
      <h1>${esc(t.title)}</h1>
      <div class="top-actions">
        ${s.isDemo ? `<span class="badge demo">${esc(t.demoBadge)}</span>` : ""}
        <select class="lang" data-language aria-label="${esc(t.languageMenuLabel)}">
          ${LANGUAGES.map(
            (language) =>
              `<option value="${language.code}" lang="${language.code}" ${language.code === lang ? "selected" : ""}>${esc(language.name)}</option>`,
          ).join("")}
        </select>
      </div>
    </header>
    ${renderSteps(s)}
    ${s.error ? `<div class="alert error" role="alert">${esc(s.error(t))}</div>` : ""}
    ${s.notice ? `<div class="alert ok" role="status">${esc(s.notice(t))}</div>` : ""}
    ${s.message ? `<div class="alert info" role="status">${esc(s.message(t))}</div>` : ""}
    ${renderBody(s)}`;
}

function renderBody(s: State): string {
  switch (s.step) {
    case "connect":
      return renderConnect(s);
    case "phone":
      return renderPhone(s);
    case "plan":
      return renderPlan(s);
    case "working":
      return renderWorking(s);
    case "results":
      return renderResults(s);
    case "settings":
      return renderSettings(s);
    case "finish":
      return renderFinish(s);
    case "finished":
      return renderFinished(s);
  }
}

function stepIndex(s: State): number {
  switch (s.step) {
    case "connect":
      return 0;
    case "phone":
      return 1;
    case "plan":
    case "results":
      return 2;
    case "working":
      return stepAfterWork(s.task) === "settings" ? 3 : 2;
    case "settings":
      return 3;
    case "finish":
    case "finished":
      return 4;
  }
}

function renderSteps(s: State): string {
  const current = stepIndex(s);
  const items = t.steps.map((label, index) => {
    if (index === current && s.step !== "finished") return `<li class="current" aria-current="step">${esc(label)}</li>`;
    return `<li class="${index <= current ? "past" : ""}">${esc(label)}</li>`;
  });
  return `<ol class="steps">${items.join("")}</ol>`;
}

function renderConnect(s: State): string {
  const usb = isWebUsbSupported();
  return `
    <section class="card">
      <h2>${esc(t.connectTitle)}</h2>
      <ol class="howto">${t.connectStepsHtml.map((step) => `<li>${step}</li>`).join("")}</ol>
      ${usb ? "" : `<div class="alert warn">${esc(t.noUsb)}</div>`}
      <div class="actions">
        <button class="primary" data-action="connect-usb" ${disabledIf(!usb || s.busy)}>${esc(t.connectButton)}</button>
        <button data-action="connect-demo" ${disabledIf(s.busy)}>${esc(t.demoButton)}</button>
      </div>
    </section>`;
}

function renderPhone(s: State): string {
  const phone = s.phone!;
  const hasBrandList = s.lists.some((list) => !list.brands.includes("*"));
  const untested = s.lists.some((list) => list.status === "untested");
  const memory =
    phone.ramAvailableMb === undefined ? t.unknown : t.memoryOf(formatMb(phone.ramAvailableMb), formatMb(phone.ramTotalMb));
  return `
    <section class="card">
      <h2>${esc(phone.model)}</h2>
      <p class="muted">${esc(phone.brand)} · Android ${esc(phone.androidVersion)}${phone.skin ? ` · ${esc(phone.skin)}` : ""}</p>
      <dl class="facts">
        ${fact(t.freeMemory, memory)}
        ${fact(t.freeStorage, formatMb(phone.storageFreeMb))}
        ${fact(t.battery, phone.batteryPercent === undefined ? t.unknown : `${phone.batteryPercent}%`)}
      </dl>
      ${phone.batteryPercent !== undefined && phone.batteryPercent < 30 ? `<div class="alert warn">${esc(t.lowBattery)}</div>` : ""}
      ${androidWarning(phone.sdk)}
    </section>
    <section class="card">
      <h2>${esc(t.listsTitle)}</h2>
      <ul class="lists">${s.lists.map(renderListSummary).join("")}</ul>
      ${hasBrandList ? "" : `<p class="muted">${esc(t.noBrandList(phone.brand))}</p>`}
      ${
        untested
          ? `<div class="alert warn">
              <p>${t.untestedWarningHtml}</p>
              <label class="check"><input type="checkbox" id="confirm-untested" ${s.untestedConfirmed ? "checked" : ""}> ${esc(t.volunteerConfirm)}</label>
            </div>`
          : ""
      }
      <div class="actions">
        <button class="primary" data-action="show-plan" ${disabledIf(s.busy || !canContinue(s))}>${esc(t.seeWhatWillBeRemoved)}</button>
        <button data-action="start-over" ${disabledIf(s.busy)}>${esc(t.disconnect)}</button>
      </div>
    </section>`;
}

function canContinue(s: State): boolean {
  return s.untestedConfirmed || s.lists.every((list) => list.status === "tested");
}

function androidWarning(sdk: number): string {
  if (sdk === 0 || sdk >= 29) return "";
  return `<div class="alert warn">${esc(sdk >= 26 ? t.androidAging : t.androidTooOld)}</div>`;
}

function renderListSummary(list: RemovalList): string {
  const badge =
    list.status === "tested"
      ? `<span class="badge ok">${esc(t.testedOn(list.testedOn.length))}</span>`
      : `<span class="badge warn">${esc(t.notTested)}</span>`;
  return `<li><span><b>${esc(listName(list, lang))}</b> <span class="muted">· ${esc(t.appCount(list.packages.length))}</span></span>${badge}</li>`;
}

function renderPlan(s: State): string {
  const removable = s.plan.filter(isRemovable);
  const kept = s.plan.filter((item) => item.keep && (item.state === "installed" || item.state === "disabled"));
  const removed = s.plan.filter((item) => item.state === "removed");
  const absent = s.plan.filter((item) => item.state === "absent");
  const restorable = removed.length + s.plan.filter((item) => item.state === "disabled").length;
  const summary = [
    [removable.length, t.planCanRemove],
    [kept.length, t.planKept],
    [removed.length, t.planAlreadyRemoved],
    [absent.length, t.planNotOnPhone],
  ] as const;
  return `
    <section class="card">
      <h2>${esc(t.chooseTitle)}</h2>
      <p class="muted">${esc(summary.filter(([count]) => count > 0).map(([count, text]) => text(count)).join(" · "))}</p>
      ${
        removable.length
          ? `<div class="select-links"><button class="link" data-action="select-all">${esc(t.selectAll)}</button> · <button class="link" data-action="select-none">${esc(t.selectNone)}</button></div>
             <ul class="rows">${removable.map((item) => renderRemovable(item, s.selected.has(item.pkg.id))).join("")}</ul>`
          : `<p>${esc(t.nothingLeft)}</p>`
      }
      <div class="actions">
        <button class="primary" data-action="remove" ${disabledIf(s.busy || s.selected.size === 0)}>${esc(t.removeApps(s.selected.size))}</button>
        ${restorable ? `<button data-action="restore" ${disabledIf(s.busy)}>${esc(t.undoApps(restorable))}</button>` : ""}
      </div>
    </section>
    ${kept.length ? `<section class="card"><h2>${esc(t.keptTitle)}</h2><ul class="rows">${kept.map((item) => renderInfo(item.pkg, t.keepReason[item.keep!])).join("")}</ul></section>` : ""}
    ${removed.length ? `<section class="card"><h2>${esc(t.alreadyRemovedTitle)}</h2><ul class="rows">${removed.map((item) => renderInfo(item.pkg)).join("")}</ul></section>` : ""}
    ${absent.length ? `<details class="card"><summary>${esc(t.notOnPhoneTitle(absent.length))}</summary><ul class="rows">${absent.map((item) => renderInfo(item.pkg)).join("")}</ul></details>` : ""}
    <div class="actions">
      <button data-action="show-plan" ${disabledIf(s.busy)}>${esc(t.checkAgain)}</button>
      <button data-action="show-settings" ${disabledIf(s.busy)}>${esc(t.nextBattery)}</button>
      <button data-action="start-over" ${disabledIf(s.busy)}>${esc(t.disconnect)}</button>
    </div>`;
}

function renderRemovable(item: PlanItem, checked: boolean): string {
  const { label, why } = packageText(item.pkg, lang);
  return `
    <li>
      <label class="row">
        <input type="checkbox" data-pkg="${esc(item.pkg.id)}" ${checked ? "checked" : ""}>
        <span>
          <b>${esc(label)}</b>${item.state === "disabled" ? ` <span class="muted">${esc(t.alreadyOff)}</span>` : ""}
          <span class="why">${esc(why)}</span>
          <code>${esc(item.pkg.id)}</code>
        </span>
      </label>
    </li>`;
}

/** A row with an app's name and a note: the reason it's kept, or else why it's on the list. */
function renderInfo(pkg: ListPackage, note?: string): string {
  const { label, why } = packageText(pkg, lang);
  return `<li class="row"><span><b>${esc(label)}</b><span class="why">${esc(note ?? why)}</span><code>${esc(pkg.id)}</code></span></li>`;
}

function renderWorking(s: State): string {
  const { done, total, current } = s.progress;
  return `
    <section class="card">
      <h2>${esc(t.working[s.task])}</h2>
      <progress max="${Math.max(total, 1)}" value="${done}"></progress>
      <p>${esc(total ? t.progress(done, total) : t.checkingPhone)}${current ? ` · ${esc(itemName(current, s))}` : ""}</p>
      <p class="muted">${esc(t.keepPlugged)}</p>
    </section>`;
}

/** The on-screen name of an app or setting, from its id. */
function itemName(id: string, s: State): string {
  const setting = settingText(id, lang);
  if (setting) return setting.label;
  const pkg = s.lists.flatMap((list) => list.packages).find((candidate) => candidate.id === id);
  return pkg ? packageText(pkg, lang).label : id;
}

function renderResults(s: State): string {
  const before = s.phone!;
  const after = s.phoneAfter;
  return `
    <section class="card">
      <h2>${esc(s.task === "remove" ? t.cleaningFinished : t.appsBroughtBack)}</h2>
      <p>${esc(appSummary(s.results))}</p>
      ${
        after
          ? `<table class="compare">
              <thead><tr><th></th><th>${esc(t.before)}</th><th>${esc(t.now)}</th></tr></thead>
              <tbody>
                <tr><th>${esc(t.freeMemory)}</th><td>${formatMb(before.ramAvailableMb)}</td><td>${formatMb(after.ramAvailableMb)}</td></tr>
                <tr><th>${esc(t.freeStorage)}</th><td>${formatMb(before.storageFreeMb)}</td><td>${formatMb(after.storageFreeMb)}</td></tr>
              </tbody>
            </table>
            <p class="muted">${esc(t.memoryAfterRestart)}</p>`
          : ""
      }
      ${s.results.length ? `<ul class="rows">${s.results.map((result) => renderResult(result, s)).join("")}</ul>` : ""}
      <div class="actions">
        <button class="primary" data-action="show-settings" ${disabledIf(s.busy)}>${esc(t.nextBattery)}</button>
        <button data-action="show-plan" ${disabledIf(s.busy)}>${esc(t.backToList)}</button>
      </div>
    </section>`;
}

function renderResult(result: ActionResult, s: State): string {
  return `
    <li class="row">
      <span class="tag ${result.outcome}">${esc(t.outcome[result.outcome])}</span>
      <span><b>${esc(itemName(result.id, s))}</b><code>${esc(result.id)}</code>${result.detail ? `<span class="why">${esc(result.detail)}</span>` : ""}</span>
    </li>`;
}

function appSummary(results: readonly ActionResult[]): string {
  if (results.length === 0) return t.nothingToDo;
  const outcomes: Outcome[] = ["removed", "disabled", "restored", "failed", "skipped"];
  const parts = outcomes
    .map((outcome) => [outcome, results.filter((result) => result.outcome === outcome).length] as const)
    .filter(([, count]) => count > 0)
    .map(([outcome, count]) => t.appCounts[outcome](count));
  return parts.join(t.listJoin) + t.sentenceEnd;
}

function renderSettings(s: State): string {
  const applied = s.settingResults.length > 0;
  const choices = s.settingStatus.filter((status) => !status.alreadySet);
  const alreadySet = s.settingStatus.filter((status) => status.alreadySet);
  const canUndo = s.settingResults.some((result) => result.previous.length > 0);

  let body: string;
  let actions: string;
  if (applied) {
    body = `<ul class="rows">${s.settingResults.map(renderSettingResult).join("")}</ul>${securityHint(s.settingResults.map((r) => r.detail))}`;
    actions = `
      <button class="primary" data-action="go-finish" ${disabledIf(s.busy)}>${esc(t.nextFinish)}</button>
      ${canUndo ? `<button data-action="undo-settings" ${disabledIf(s.busy)}>${esc(t.undoSettings)}</button>` : ""}`;
  } else {
    body = choices.length
      ? `<ul class="rows">${choices.map((status) => renderSettingChoice(status, s.selectedSettings.has(status.setting.id))).join("")}</ul>`
      : `<p>${esc(t.allSet)}</p>`;
    if (alreadySet.length && choices.length) {
      body += `<h3>${esc(t.alreadySetTitle)}</h3><ul class="rows">${alreadySet.map(renderSettingInfo).join("")}</ul>`;
    }
    actions = choices.length
      ? `<button class="primary" data-action="apply-settings" ${disabledIf(s.busy || s.selectedSettings.size === 0)}>${esc(t.applySettings(s.selectedSettings.size))}</button>
         <button data-action="go-finish" ${disabledIf(s.busy)}>${esc(t.skip)}</button>`
      : `<button class="primary" data-action="go-finish" ${disabledIf(s.busy)}>${esc(t.nextFinish)}</button>`;
  }

  return `
    <section class="card">
      <h2>${esc(t.settingsTitle)}</h2>
      <p class="muted">${esc(t.settingsIntro)}</p>
      ${body}
      <div class="actions">${actions}</div>
    </section>
    <div class="actions">
      <button data-action="show-plan" ${disabledIf(s.busy)}>${esc(t.backToApps)}</button>
    </div>`;
}

function renderSettingChoice(status: SettingStatus, checked: boolean): string {
  const { id } = status.setting;
  const { label, why } = settingText(id, lang)!;
  return `
    <li>
      <label class="row">
        <input type="checkbox" data-setting="${esc(id)}" ${checked ? "checked" : ""}>
        <span><b>${esc(label)}</b><span class="why">${esc(why)}</span></span>
      </label>
    </li>`;
}

function renderSettingInfo(status: SettingStatus): string {
  const { label, why } = settingText(status.setting.id, lang)!;
  return `<li class="row"><span><b>${esc(label)}</b><span class="why">${esc(why)}</span></span></li>`;
}

function renderSettingResult(result: SettingResult): string {
  const label = settingText(result.id, lang)?.label ?? result.label;
  const failure = result.outcome === "failed" ? `<span class="why">${esc(t.settingNotAccepted)}</span>` : "";
  return `
    <li class="row">
      <span class="tag ${result.outcome}">${esc(t.settingOutcome[result.outcome])}</span>
      <span><b>${esc(label)}</b>${failure}${result.detail ? `<code>${esc(result.detail)}</code>` : ""}</span>
    </li>`;
}

/** MIUI refuses settings changes unless "USB debugging (Security settings)" is on. */
function securityHint(details: readonly (string | undefined)[]): string {
  if (!details.some((detail) => detail?.includes("SecurityException"))) return "";
  return `<div class="alert warn">${t.securityHintHtml}</div>`;
}

function renderFinish(s: State): string {
  return `
    <section class="card">
      <h2>${esc(t.finishTitle)}</h2>
      <p>${esc(t.finishWhy)}</p>
      <p class="muted">${t.finishUndoHintHtml}</p>
      <div class="actions">
        <button class="primary" data-action="finish-up" ${disabledIf(s.busy)}>${esc(t.finishButton)}</button>
        <button data-action="show-settings" ${disabledIf(s.busy)}>${esc(t.back)}</button>
      </div>
    </section>
    ${renderSessionSummary(s)}`;
}

function renderFinished(s: State): string {
  const finish = s.finish!;
  const ready = finish.devOptionsOff && finish.usbDebuggingOff;
  const problem = finish.devOptionsOff ? t.finishStillConnected : t.finishRefused;
  const status = ready
    ? `<div class="alert ok">${esc(t.readyStatus)}</div>`
    : `<div class="alert warn">
        <p>${esc(problem)}${finish.detail ? ` <code>${esc(finish.detail)}</code>` : ""}</p>
        <p>${t.turnOffByHandHtml}</p>
      </div>
      ${securityHint([finish.detail])}`;
  return `
    <section class="card">
      <h2>${esc(ready ? t.readyTitle : t.almostTitle)}</h2>
      ${status}
      <h3>${esc(t.handoverTitle)}</h3>
      <ol class="howto">${t.handoverStepsHtml.map((step) => `<li>${step}</li>`).join("")}</ol>
      <div class="actions">
        <button class="primary" data-action="download-report">${esc(t.downloadReport)}</button>
        <button data-action="start-over">${esc(t.cleanAnother)}</button>
      </div>
    </section>
    ${renderSessionSummary(s)}`;
}

// The phone's state now: only each app's or setting's latest outcome counts, and
// anything put back by Undo no longer counts as a change. The report keeps the full log.
function renderSessionSummary(s: State): string {
  const apps = latestById(s.appLog).filter((result) => result.outcome !== "restored" && result.outcome !== "skipped");
  const settings = latestById(s.settingLog);
  const changed = settings.filter((result) => result.outcome === "changed").length;
  const failed = settings.filter((result) => result.outcome === "failed").length;
  const settingParts = [changed && t.settingsChanged(changed), failed && t.settingsFailed(failed)].filter(Boolean);
  return `
    <section class="card">
      <h2>${esc(t.summaryTitle)}</h2>
      <p><b>${esc(t.summaryApps)}</b> ${esc(apps.length ? appSummary(apps) : t.noAppsChanged)}</p>
      <p><b>${esc(t.summarySettings)}</b> ${esc(settingParts.length ? settingParts.join(t.listJoin) + t.sentenceEnd : t.noSettingsChanged)}</p>
    </section>`;
}

function latestById<T extends { id: string }>(log: readonly T[]): T[] {
  return [...new Map(log.map((entry) => [entry.id, entry])).values()];
}

// ---- Helpers ----

function fact(label: string, value: string): string {
  return `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
}

function formatMb(mb: number | undefined): string {
  if (mb === undefined) return t.unknown;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function disabledIf(condition: boolean): string {
  return condition ? "disabled" : "";
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Everything from the phone or a list file goes through this before reaching innerHTML.
function esc(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

applyLanguageToDocument();
update({});
