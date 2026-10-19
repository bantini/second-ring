# Clean this phone (prototype)

A web page that removes bloatware from old Android phones over USB, without unlocking or rooting them. It's step 2 of [PLAN.md](../PLAN.md).

## Run it

```bash
npm install
npm run dev
```

Open the address it prints in Chrome or Edge. WebUSB only works in Chromium browsers (including Chrome on Android) and only on `https://` or `localhost`. "Try with a demo phone" runs the whole flow against a simulated Xiaomi phone.

```bash
npm test          # unit tests
npm run build     # type-check, then build static files into dist/
```

## How it works

1. **Connect:** USB debugging (ADB) over WebUSB, using the [Tango](https://github.com/yume-chan/ya-webadb) library. The phone asks "Allow USB debugging?" once per browser.
2. **Check:** reads the model, Android version, brand skin, free memory, storage and battery (`src/device.ts`).
3. **Choose:** picks the lists in `lists/` for the phone's brand, plus the list for every phone, and shows each app's state (`src/cleaner.ts`).
4. **Clean:** runs `pm uninstall --user 0 <app>`. If the phone refuses, it runs `pm disable-user` instead. The app's files stay in the read-only system storage.
5. **Undo:** runs `pm install-existing` or `pm enable` for every listed app that is removed or turned off. A factory reset also restores everything.
6. **Battery:** changes ordinary Android settings with `settings put` (`src/settings.ts`): shorter animations, a screen timeout of at most 1 minute, automatic brightness, battery saver at 20%, adaptive battery, Wi-Fi and Bluetooth scanning off, mobile data resting on Wi-Fi, no stay-awake while charging, and always-on display off. Each change is read back to confirm it, and the old value is recorded so Undo can put it back.
7. **Finish:** hides developer options, then turns off USB debugging as the very last command. UPI apps refuse to open while either is on. The phone disconnecting confirms it worked.

Nothing leaves the browser. The downloadable report has no serial number.

On Xiaomi, Redmi and Poco phones, MIUI blocks settings changes unless **USB debugging (Security settings)** is also on in Developer options. Removing apps works without it; the battery and finish steps show a hint when the phone refuses.

## Safety

- `src/protect.ts` lists apps that are never removed: calls and SMS, VoLTE (IMS), Play services, WebView, keyboards, home screens, cameras, and brands' permission managers. It also protects whatever this phone currently uses as its home screen, keyboard, SMS app, phone app and WebView.
- Protection is checked when a list loads and again right before every removal.
- Package names are validated before any command reaches the phone, and so are old setting values before Undo sends them back.
- Lists marked `untested` need a pilot volunteer to confirm before use.

## Languages

The page is available in English, Hindi (हिन्दी), Bengali (বাংলা), Marathi (मराठी), Gujarati (ગુજરાતી), Tamil (தமிழ்), Telugu (తెలుగు), Kannada (ಕನ್ನಡ), Malayalam (മലയാളം) and Urdu (اردو). A menu in the header switches language, and the browser remembers the choice. On the first visit the page uses the browser's preferred language if it's one of these. Urdu is shown right to left.

- **Page text and battery settings:** `src/locales/<lang>.ts`, one file per language, all with the same keys as `en.ts`. Keys ending in `Html` contain markup; everything else is escaped.
- **Removal-list text:** `lists/translations/<lang>.json`, with each list's name and each app's reason. An app's `label` is only given where it differs from English, because most labels are brand names. Missing text falls back to English.
- **Kept in English:** phone menu names (Settings, Developer options, USB debugging), app brand names, messages from the phone itself, and the downloaded report.
- **Tests:** `npm test` fails if any language is missing a string, or a string isn't in that language's script, or a list translation misses an app.

To add a language:
1. Add it to `Lang` and `LANGUAGES` in `src/i18n.ts`, with its name, direction and script.
2. Write `src/locales/<lang>.ts`.
3. Write `lists/translations/<lang>.json` and register it in `src/lists.ts`.

All translations were written for this prototype. Each language should be checked by a native speaker before recipients use it.

## Removal lists

Lists live in `lists/<brand>.json`:

```json
{
  "id": "xiaomi",
  "version": 1,
  "name": "Xiaomi, Redmi and Poco (MIUI)",
  "status": "untested",
  "testedOn": [{ "model": "Redmi Note 7 Pro", "android": "10", "date": "2026-11-02" }],
  "brands": ["xiaomi", "redmi", "poco"],
  "packages": [{ "id": "com.miui.msa.global", "label": "MIUI system ads", "why": "Shows ads inside Xiaomi's own apps" }]
}
```

`brands` holds lower-case brand or manufacturer names as Android reports them; `"*"` means every phone. The bundled lists are starter lists written for this prototype, and every one of them is untested. Set `status` to `"tested"` only after volunteers have checked calls, SMS and the UPI app on the models listed in `testedOn`.

If you copy entries from UAD-ng's lists, note that they are GPL-3.0 licensed.

## Not done yet

- Not yet tried on a real phone.
- Settings Undo only works in the same session; the old values are also in the report.
- Installing the essential apps (UPI, WhatsApp, study apps).
- A native speaker's review of each language.
- Help with Windows USB drivers.
