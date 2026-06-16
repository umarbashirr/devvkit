import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Write a text file, creating parent dirs as needed. */
export async function writeText(
  dir: string,
  relPath: string,
  contents: string,
): Promise<void> {
  const full = join(dir, relPath);
  await mkdir(dirname(full), { recursive: true });
  // Ensure a single trailing newline.
  await writeFile(full, contents.replace(/\n*$/, "\n"), "utf8");
}

/** Append lines to a file (e.g. .env, .gitignore), creating it if missing. */
export async function appendLines(
  dir: string,
  relPath: string,
  lines: string[],
): Promise<void> {
  const full = join(dir, relPath);
  let existing = "";
  try {
    existing = await readFile(full, "utf8");
  } catch {
    existing = "";
  }
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, existing + prefix + lines.join("\n") + "\n", "utf8");
}

type Json = Record<string, unknown>;

/** Read, mutate, and write back a JSON file (preserving 2-space indent). */
export async function patchJson(
  dir: string,
  relPath: string,
  mutate: (json: Json) => void,
): Promise<void> {
  const full = join(dir, relPath);
  const raw = await readFile(full, "utf8");
  const json = JSON.parse(raw) as Json;
  mutate(json);
  await writeFile(full, JSON.stringify(json, null, 2) + "\n", "utf8");
}

/** Convenience: patch package.json scripts. */
export async function addScripts(
  dir: string,
  scripts: Record<string, string>,
): Promise<void> {
  await patchJson(dir, "package.json", (pkg) => {
    pkg.scripts = { ...(pkg.scripts as Json | undefined), ...scripts };
  });
}
