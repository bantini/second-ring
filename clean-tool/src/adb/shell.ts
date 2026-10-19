/**
 * What the cleanup logic needs from a phone: run a command and read its text output.
 * The real phone (over WebUSB) and the demo phone both implement this.
 */
export interface PhoneShell {
  readonly serial: string;
  readonly isDemo: boolean;
  /** Resolves when the phone is unplugged or the connection drops. */
  readonly disconnected: Promise<void>;
  /**
   * Runs a command on the phone and returns stdout and stderr mixed together.
   * Arguments are joined with spaces without quoting, so only pass values that
   * were validated first (see isValidPackageName).
   */
  run(args: readonly string[]): Promise<string>;
  close(): Promise<void>;
}
