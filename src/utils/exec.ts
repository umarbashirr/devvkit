import { execa } from "execa";

/**
 * Run a command, streaming its output to the user's terminal.
 * Throws on non-zero exit.
 */
export async function run(
  cmd: string[],
  opts: { cwd?: string } = {},
): Promise<void> {
  const [bin, ...args] = cmd;
  if (!bin) throw new Error("run() called with empty command");
  await execa(bin, args, {
    cwd: opts.cwd,
    stdio: "inherit",
  });
}

/** Run a command quietly, returning stdout. Throws on non-zero exit. */
export async function runQuiet(
  cmd: string[],
  opts: { cwd?: string } = {},
): Promise<string> {
  const [bin, ...args] = cmd;
  if (!bin) throw new Error("runQuiet() called with empty command");
  const { stdout } = await execa(bin, args, { cwd: opts.cwd });
  return stdout;
}
