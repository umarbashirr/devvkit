import * as p from "@clack/prompts";
import pc from "picocolors";

import { setQuiet } from "./exec.js";

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

type RGB = [number, number, number];
const FROM: RGB = [34, 211, 238]; // cyan
const TO: RGB = [167, 139, 250]; // violet

function truecolor(text: string, [r, g, b]: RGB): string {
  return useColor ? `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m` : text;
}

/** Per-character color gradient across a string. */
export function gradient(text: string, from: RGB = FROM, to: RGB = TO): string {
  if (!useColor) return text;
  const chars = [...text];
  const n = Math.max(chars.length - 1, 1);
  return chars
    .map((ch, i) => {
      const t = i / n;
      return truecolor(ch, [
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t),
      ]);
    })
    .join("");
}

const WORDMARK = [
  "    _                _    _ _    ",
  "  __| | _____   ____| | _(_) |_  ",
  " / _` |/ _ \\ \\ / / _| |/ / | __| ",
  "| (_| |  __/\\ V /\\__ \\   <| | |_  ",
  " \\__,_|\\___| \\_/ |___/_|\\_\\_|\\__| ",
];

/** Gradient wordmark + tagline shown at startup. */
export function banner(version: string): void {
  console.log();
  for (const line of WORDMARK) console.log(gradient(line));
  console.log(
    "  " + pc.dim("scaffold opinionated starter kits") + pc.dim(`  ·  v${version}`),
  );
  console.log();
}

/**
 * Run an async phase under an animated spinner. Subprocess output is captured
 * (quiet) and only revealed if the phase throws. Shows elapsed time on success.
 */
export async function task<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const s = p.spinner();
  s.start(label);
  setQuiet(true);
  const start = Date.now();
  try {
    const result = await fn();
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    s.stop(`${pc.green("✓")} ${label} ${pc.dim(`${secs}s`)}`);
    return result;
  } catch (err) {
    s.stop(`${pc.red("✗")} ${label}`, 1);
    throw err;
  } finally {
    setQuiet(false);
  }
}
