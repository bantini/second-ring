/** The first line of a command's output, trimmed and capped, for showing on screen. */
export function firstLine(output: string): string {
  return (output.trim().split("\n")[0] ?? "").slice(0, 200);
}
