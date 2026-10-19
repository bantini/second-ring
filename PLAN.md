# Plan: a second life for discarded Android phones

_Draft · updated 2026-10-19 · India_

## 1. Goal

Collect old phones that are about to be thrown away, make them clean and fast again, and give them to people who can't afford a phone. Adults will use them for calls, SMS and UPI payments; students will use them to study.

Installing should feel like CrossPoint on Xteink devices: open a web page, plug in the phone, click. Owners can do it themselves, and volunteers at donation drives use the same tools.

**A revived phone must:**
- make calls (including VoLTE, since Jio has no 2G or 3G) and send SMS
- run a UPI app
- browse the web, play music and video, and run study apps
- have no bloatware or ads, and use as little battery as possible
- be safe for first-time users: no unknown apps, a screen lock, and basic fraud awareness

## 2. Approach: simplest first

Bloatware and ads are what make old phones unusable. They can be removed without unlocking the phone, so we start there and build a full OS only for the phones that cleanup can't save.

| Step | What | Works on | Development needed |
|---|---|---|---|
| **1. Pilot** | Clean phones by hand with the free UAD-ng desktop app and record the results | Every brand | None |
| **2. "Clean this phone" web tool** | One-click cleanup in the browser, using the removal lists tested in the pilot | Every brand | A small web app |
| **3. Clean OS** | A LineageOS-based OS with a web installer | Qualcomm phones that can be unlocked and that LineageOS supports | A full OS project |

**Cleaning the original Android vs. installing a clean OS**

| | Clean the original Android (steps 1–2) | Clean OS install (step 3) |
|---|---|---|
| Works on | Every brand, including Vivo, Oppo and Realme | Unlockable Qualcomm phones that LineageOS supports |
| How clean | Most bloatware and ads gone; the manufacturer's base system stays | Completely clean |
| Battery and speed | Noticeably better | Best |
| Security updates | None; stays on its old Android | Newer Android with monthly patches |
| Calls (VoLTE) | Already work | Must be tested on each model |
| UPI apps | All work | Some may refuse to run |
| Volunteer time per phone | About 10 minutes | About 30 minutes; the phone is wiped |
| Undo | Factory reset | Reinstall the original software |

**Which path each phone takes**

| Phone | Path |
|---|---|
| Android 10 or later, working | Clean it (steps 1–2) |
| Android 8–9 | Clean it, but its apps will stop getting updates soon. Prefer the clean OS if the phone qualifies. |
| Still slow after cleanup, or too old for current apps | Clean OS, if the phone can be unlocked and LineageOS supports it |
| Anything else, or broken beyond cheap repair | Keep for spare parts, or send to an authorised e-waste recycler |

The Android 10 cut-off is set by current Chrome and UPI app requirements. Check it again when the pilot starts.

## 3. Intake checklist (every phone)

1. **The donor prepares the phone:** removes their Google account (Settings → Accounts) and takes out the SIM and memory card. If they skip the Google account, the phone's anti-theft lock (FRP) blocks it after a reset.
2. **Check the IMEI** with Know Your Mobile on Sanchar Saathi. Reject phones that are blocked or reported stolen.
3. **Never alter an IMEI** (it's an offence under the Telecommunications Act 2023), and never bypass FRP.
4. **Factory reset** to erase the donor's data, and give the donor a receipt.
5. **Test the hardware:**
   - charging, and how long the battery lasts
   - screen and touch
   - speaker and microphone (needed for calls)
   - camera (needed to scan UPI QR codes)
   - SIM slot and Wi-Fi
6. **Battery:**
   - Replace it if it has worn down, which costs about ₹500–1,500 at a repair shop.
   - Never use a swollen battery; it's a fire risk.
7. **Charger and cable:** usually missing; add them.
8. **Record the phone's details:** brand, model, Android version, RAM, condition, and which path it takes.

## 4. Step 1: Pilot (no development)

Process 50–100 donated phones and hand them out through one NGO or school, over **4–6 weeks**.

**For each phone**
1. Run the intake checklist.
2. Set up the phone in the recipient's language and sign in with their Google account, or create one.
3. Install every update: system updates, Play Store "Update all", and Google Play system updates.
4. Turn on USB debugging. Run **UAD-ng** with the brand's "Recommended" list, removing only what's on that list.
5. **Low-power settings:**
   - animations off
   - Wi-Fi and Bluetooth scanning off; NFC off
   - always-on display off
   - background limits for heavy apps
   - sync off for accounts the recipient doesn't use
   - Simple/Easy mode or a simple home screen
6. **Install the essential apps** (see section 7).
7. **Safety settings:**
   - a screen-lock PIN
   - Find My Device
   - Play Protect (on by default)
   - "Install unknown apps" off for every app
   - Chrome Safe Browsing
   - Google Family Link for children
8. **Turn developer options off.** UPI apps refuse to run while they're on.
9. Test a call, an SMS, and opening the UPI app.
10. Hand the phone over with training (see section 7).

**Measure on each model, before and after cleanup**
- free RAM after boot
- free storage
- battery drain over 24 hours on standby with a SIM in
- launch time for the dialer and the browser
- any removal that broke something, and how it was fixed

**What the pilot delivers**
- a tested removal list for each model that arrives
- real figures on which brands, models and Android versions get donated, and what share goes down each path
- feedback from recipients

## 5. Step 2: "Clean this phone" web tool

A static web page that uses an open-source WebUSB ADB library (such as Tango) to do step 1's cleanup in one click. It runs in Chrome or Edge on a PC, or on another Android phone connected with a USB OTG cable, for people without a computer.

**Flow**
1. **Plug in.** The user turns on USB debugging (shown with pictures, in their language) and plugs the phone in.
2. **Check the phone.** The page reads the brand, model and Android version, checks the battery level, and says whether a tested list exists for this model.
3. **Show the plan.** The page lists what will be removed and what will change.
4. **Clean.** It removes the apps on the list.
5. **Apply low-power settings.**
6. **Install essentials.** It opens the essential apps' Play Store pages so the user can install them.
7. **Restart and check.** It restarts the phone and confirms that the phone, SMS and launcher still work.
8. **Finish.** It turns developer options off, which also ends the USB connection.

**Safety**
- Non-technical users only ever get lists marked "tested". Untested models get a clear "not yet supported" message.
- Never remove core components: phone, SMS, system UI, the home screen (until a replacement is set), Google Play services, WebView, the keyboard.
- An **Undo** button reinstalls anything removed, using Android's own restore command. A factory reset also restores everything.

**Data and privacy**
- Removal lists are data files in the repository, one per brand and model, each marked tested or untested. Start from UAD-ng's lists. UAD-ng is GPL-licensed, so keep our tool open source under a compatible licence.
- The tool runs entirely in the browser and uploads nothing. An optional, anonymous "this list worked / failed on model X" report helps improve the lists.

**Release**
- Languages: English and Hindi first, then other Indian languages.
- Hosting: any static host.

**Effort:** 1–2 developers for 6–8 weeks. Work can start during the pilot.

**Done when:** an untrained volunteer can clean a phone in 15 minutes or less on the 10 most-donated models.

**Optional: lock-down.** If the pilot shows recipients installing harmful apps or undoing the safety settings, add an option that sets up the phone through a QR code: tap the first setup screen six times, then scan a QR code. The phone is then managed through Google's free Android Management API, with an app allowlist and settings that can't be changed. This needs no unlocking and works on every brand, but you have to run the management service. Manage to protect, not to watch: no location tracking, no reading anything on the phone.

## 6. Step 3: Clean OS (later)

This is for phones that are still too slow after cleanup, or too old for current apps. Start it only after steps 1–2 show which models are common and still need it.

- **Base:** LineageOS (Android's open-source base), slimmed down and hardened.
  - release builds signed with our own keys
  - Android Go's low-RAM settings
  - no Google services by default
  - SELinux enforcing, no root, file-based encryption
  - signed monthly updates
- **Phones:** Qualcomm only, with official LineageOS support. Unlocking varies by brand:

  | Brand | Unlocking |
  |---|---|
  | Pixel, OnePlus | Almost one-click |
  | Motorola | Needs an unlock code from Motorola's website |
  | Xiaomi, Redmi, Poco | Needs Xiaomi's Windows tool and a wait of about a week |
  | Samsung | Later, through a desktop program only |
  | Vivo, Oppo, Realme | No official way. Exploit-based methods are excluded. |

- **Calls:** VoLTE must work on Jio and Airtel. Test every model on Jio, Airtel, Vi and BSNL, in both SIM slots.
- **UPI:**
  - Test which UPI apps work without Google services.
  - Build in UPI 123PAY (pay by phone call) as a fallback.
  - Approach NBSL (which runs BHIM) or another UPI provider about a partnership.
  - Never fake Google's Play Integrity check.
- **Browser:** Chromium-based, updated at least monthly, with a patch so audio keeps playing when the screen is off.
- **Installer:** the same web page as step 2, with fastboot over WebUSB added.
  - guidance for each brand's unlock steps
  - download, verify and flash
  - relock the bootloader where the phone supports it
  - a "go back to original software" option for every model
- **Transparency:** a public security status page for each model: patch level, date of its last vendor firmware, whether it can be relocked, and when support ends.
- **Effort:** 4–6 engineers, 9–12 months to a first release on 3–5 models.

The checklist in Appendix B decides which models qualify.

## 7. Recipients and handover

**Who:** poor households and students, reached through NGOs and schools.

**Essential apps (to confirm)**
- Phone, Messages, Chrome
- one UPI app (BHIM, PhonePe or Google Pay)
- WhatsApp, which schools, employers and government schemes in India use
- for students: DIKSHA, Khan Academy and YouTube, plus Kolibri and Kiwix for offline study with little data
- Files by Google, to keep storage free

**What recipients need**
- **UPI:** a SIM in their own name, and a bank account (most poor households have a Jan Dhan account). They can set a UPI PIN with an Aadhaar OTP if they have no debit card.
- **Students:** the phone works on Wi-Fi without a SIM. Public Wi-Fi under PM-WANI helps.
- **Ongoing cost:** mobile recharges.

**Training (15 minutes, in the local language, plus a printed one-page guide)**
- calls, SMS and the study apps
- making a UPI payment
- fraud basics: never share your PIN or an OTP, never install apps sent over WhatsApp, and report fraud by calling 1930

**Support:** the NGO or school that hands out the phones is the local help point for questions and battery swaps.

## 8. Partners, funding and legal

- **Partners:**
  - NGOs and schools for distribution
  - repair shops for batteries and repairs
  - companies' CSR programmes for both funding and old company phones (education and poverty relief qualify as CSR spending)
- **Legal:**
  - IMEI rules (Telecommunications Act 2023)
  - no bypassing FRP
  - protecting donor data (DPDP Act)
  - check whether you must register as a refurbisher under the E-Waste (Management) Rules, 2022
  - keep "Android" out of the product name
  - GPL obligations for UAD-ng's lists and, in step 3, the kernel source

## 9. Timeline

| Step | Time | People | Done when |
|---|---|---|---|
| 1. Pilot | 4–6 weeks | A coordinator and 2–3 volunteers | 50–100 phones handed out; tested lists for the common models; before/after figures |
| 2. Web tool | 6–8 weeks (overlaps the pilot) | 1–2 developers | An untrained volunteer cleans a phone in 15 minutes or less on the 10 most-donated models |
| 3. Clean OS | 9–12 months | 4–6 engineers | Signed, updatable OS on 3–5 models that passes Appendix B |

## 10. Risks

| Risk | Mitigation |
|---|---|
| A removal breaks a phone | Tested lists only; Undo button; factory reset as the last resort |
| No security patches on the original Android | Apps and Chrome kept updated; unknown apps blocked; Play Protect; training |
| Stolen phones donated | IMEI check; FRP never bypassed |
| Recipients can't afford recharges | Students on Wi-Fi; PM-WANI; ask telecom operators for partner plans |
| Battery hazards | Inspect every battery; replace worn ones; never use swollen ones |
| Bloatware comes back after a reset or vendor update | Run the tool again; old phones rarely get vendor updates |
| Recipients undo the safety settings | Training; the optional lock-down setup in step 2 |

## 11. Open questions

- The final app list: is WhatsApp in? The YouTube app, or the browser only?
- Which NGO or school runs the pilot?
- Funding and CSR partners
- Product name
- Is the optional lock-down needed?

---

## Appendix A: Pilot record sheet (one row per phone)

| Field | Example |
|---|---|
| Phone ID | P-0001 |
| Brand / model / Android version / RAM | Redmi Note 7 / Android 10 / 3 GB |
| IMEI check passed | Yes |
| Battery replaced | Yes |
| Free RAM after boot: before / after cleanup | |
| Free storage: before / after | |
| Battery drain over 24 h on standby: before / after | |
| Dialer and browser launch time: before / after | |
| Removal list used | xiaomi-redmi-note-7-v1 |
| Anything broken, and the fix | |
| Path | Clean / Clean OS / Parts |
| Recipient group | Student / Adult |
| Follow-up after 2 weeks | Using UPI? Any problems? |

## Appendix B: Clean-OS checklist (step 3)

Use 2–3 units of each candidate model, with the current official LineageOS build installed and no Google services.

**Phone**
- [ ] Unlocks; record the steps and time taken
- [ ] Bootloader can be relocked with our own key (yes/no)
- [ ] Free RAM after boot; standby battery drain over 24 hours

**Calls and SMS (Jio, Airtel, Vi and BSNL, in both SIM slots)**
- [ ] VoLTE outgoing and incoming calls
- [ ] Wi-Fi calling (Jio, Airtel)
- [ ] Keypad tones in phone menus (needed for UPI 123PAY)
- [ ] USSD codes
- [ ] SMS sent and received, including Hindi text
- [ ] Another app can send an SMS from the chosen SIM
- [ ] Emergency test mode works; never call 112 to test

**UPI (BHIM, PhonePe, Paytm, Google Pay and 2 bank apps)**
- [ ] Installs and opens without root or integrity warnings
- [ ] Verifying the SIM by SMS succeeds; a bank account links; a UPI PIN can be set
- [ ] A QR code can be scanned; a ₹1 payment goes through
- [ ] A UPI 123PAY payment by phone call works

**Browser and media**
- [ ] YouTube, YouTube Music and JioSaavn play
- [ ] Audio keeps playing with the screen off (expected to fail until the browser is patched)

**Exit criteria**
- At least 3 models pass every call and SMS test on Jio and Airtel
- At least 1 UPI app works end to end, or there's an explicit decision on Google services
