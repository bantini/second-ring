// Android package names: letters, digits and underscores in at least two dot-separated
// parts. Anything else is refused before it reaches the phone's shell.
const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

export function isValidPackageName(name: string): boolean {
  return PACKAGE_NAME.test(name);
}

/** Parses `pm list packages` output: one "package:com.example" per line. */
export function parsePackageList(output: string): Set<string> {
  const ids = new Set<string>();
  for (const line of output.split("\n")) {
    const match = /^package:(\S+)/.exec(line.trim());
    if (match) ids.add(match[1]);
  }
  return ids;
}
