import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import type { PhoneShell } from "./shell";

export type ConnectFailure = "no-webusb" | "cancelled" | "busy";

export class ConnectError extends Error {
  constructor(
    readonly reason: ConnectFailure,
    options?: ErrorOptions,
  ) {
    super(reason, options);
  }
}

/** WebUSB needs a Chromium browser and a secure page (https:// or localhost). */
export function isWebUsbSupported(): boolean {
  return AdbDaemonWebUsbDeviceManager.BROWSER !== undefined;
}

// The key is kept in this browser, so with "Always allow" ticked the phone only
// asks "Allow USB debugging?" the first time.
const credentialStore = new AdbWebCredentialStore("Clean this phone");

export async function connectUsbPhone(onWaitingForApproval: () => void): Promise<PhoneShell> {
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
  if (!manager) throw new ConnectError("no-webusb");

  const device = await manager.requestDevice();
  if (!device) throw new ConnectError("cancelled");

  const connection = await device.connect().catch((error: unknown) => {
    if (error instanceof AdbDaemonWebUsbDevice.DeviceBusyError) {
      throw new ConnectError("busy", { cause: error });
    }
    throw error;
  });

  onWaitingForApproval();
  const transport = await AdbDaemonTransport.authenticate({
    serial: device.serial,
    connection,
    credentialStore,
  });
  return new UsbPhoneShell(new Adb(transport));
}

class UsbPhoneShell implements PhoneShell {
  readonly isDemo = false;
  readonly #adb: Adb;

  constructor(adb: Adb) {
    this.#adb = adb;
  }

  get serial(): string {
    return this.#adb.serial;
  }

  get disconnected(): Promise<void> {
    return this.#adb.disconnected;
  }

  run(args: readonly string[]): Promise<string> {
    // The "none" protocol works on every Android version; the newer shell
    // protocol (separate stderr and exit codes) needs Android 7.
    return this.#adb.subprocess.noneProtocol.spawnWaitText(args);
  }

  close(): Promise<void> {
    return this.#adb.close();
  }
}
