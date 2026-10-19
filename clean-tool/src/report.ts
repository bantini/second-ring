import type { ActionResult } from "./cleaner";
import type { PhoneInfo } from "./device";
import type { RemovalList } from "./lists";
import type { FinishResult, SettingResult } from "./settings";

/** A record of one phone's cleanup for the pilot record sheet. Contains no serial number or personal data. */
export function buildReport(input: {
  phone: PhoneInfo;
  phoneAfter?: PhoneInfo;
  lists: readonly RemovalList[];
  apps: readonly ActionResult[];
  settings: readonly SettingResult[];
  finish?: FinishResult;
  demo: boolean;
}) {
  return {
    tool: "clean-this-phone",
    toolVersion: "0.2.0",
    createdAt: new Date().toISOString(),
    demo: input.demo,
    phone: input.phone,
    phoneAfter: input.phoneAfter ?? null,
    lists: input.lists.map(({ id, version, status }) => ({ id, version, status })),
    apps: input.apps,
    settings: input.settings,
    finish: input.finish ?? null,
  };
}

export function reportFileName(phone: PhoneInfo, date = new Date()): string {
  const model = phone.model.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "phone";
  return `clean-report-${model}-${date.toISOString().slice(0, 10)}.json`;
}
