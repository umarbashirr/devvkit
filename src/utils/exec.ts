import { execa } from "execa";

// When quiet, subprocess output is captured (not streamed) so spinners stay
// clean; on failure the captured output is surfaced in the thrown error.
let quiet = false;
export function setQuiet(value: boolean): void {
  quiet = value;
}

/** Run a command. Streams output normally, captures it when quiet. */
export async function run(cmd: string[], opts: { cwd?: string } = {}): Promise<void> {
  const [bin, ...args] = cmd;
  if (!bin) throw new Error("run() called with empty command");
  try {
    await execa(bin, args, { cwd: opts.cwd, stdio: quiet ? "pipe" : "inherit" });
  } catch (err) {
    if (quiet && err && typeof err === "object") {
      const e = err as { shortMessage?: string; message?: string; stdout?: string; stderr?: string };
      const out = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
      throw new Error(`${e.shortMessage ?? e.message ?? "command failed"}${out ? `\n${out}` : ""}`);
    }
    throw err;
  }
}

/** Run a command quietly, returning stdout. Throws on non-zero exit. */
export async function runQuiet(cmd: string[], opts: { cwd?: string } = {}): Promise<string> {
  const [bin, ...args] = cmd;
  if (!bin) throw new Error("runQuiet() called with empty command");
  const { stdout } = await execa(bin, args, { cwd: opts.cwd });
  return stdout;
}
