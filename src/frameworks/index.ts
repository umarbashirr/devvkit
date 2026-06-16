import type { FrameworkSelection, ProjectContext } from "../types.js";
import { scaffoldNext } from "./next.js";
import { scaffoldReactVite } from "./react-vite.js";
import { scaffoldVueVite } from "./vue-vite.js";

export interface FrameworkChoice {
  value: string;
  label: string;
  hint: string;
  selection: FrameworkSelection;
  supported: boolean;
}

/** The framework menu, in display order. */
export const FRAMEWORK_CHOICES: FrameworkChoice[] = [
  {
    value: "react-vite-ts",
    label: "React + Vite (TS)",
    hint: "frontend",
    selection: { id: "react-vite", language: "ts", fullstack: false },
    supported: true,
  },
  {
    value: "react-vite-js",
    label: "React + Vite (JS)",
    hint: "frontend",
    selection: { id: "react-vite", language: "js", fullstack: false },
    supported: true,
  },
  {
    value: "vue-vite-ts",
    label: "Vue + Vite (TS)",
    hint: "coming soon",
    selection: { id: "vue-vite", language: "ts", fullstack: false },
    supported: false,
  },
  {
    value: "vue-vite-js",
    label: "Vue + Vite (JS)",
    hint: "coming soon",
    selection: { id: "vue-vite", language: "js", fullstack: false },
    supported: false,
  },
  {
    value: "next",
    label: "Next.js",
    hint: "frontend; pairs with a backend",
    selection: { id: "next", language: "ts", fullstack: false },
    supported: true,
  },
  {
    value: "next-fullstack",
    label: "Next.js Full Stack",
    hint: "self-contained",
    selection: { id: "next", language: "ts", fullstack: true },
    supported: true,
  },
];

export function frameworkChoiceByValue(value: string): FrameworkChoice | undefined {
  return FRAMEWORK_CHOICES.find((c) => c.value === value);
}

/** Human label for a resolved framework selection (for progress display). */
export function frameworkLabel(ctx: ProjectContext): string {
  const match = FRAMEWORK_CHOICES.find(
    (c) =>
      c.selection.id === ctx.framework.id &&
      c.selection.language === ctx.framework.language &&
      c.selection.fullstack === ctx.framework.fullstack,
  );
  return match?.label ?? ctx.framework.id;
}

/** Scaffold the chosen frontend into ctx.webDir. */
export async function scaffoldFramework(ctx: ProjectContext): Promise<void> {
  switch (ctx.framework.id) {
    case "next":
      return scaffoldNext(ctx);
    case "react-vite":
      return scaffoldReactVite(ctx);
    case "vue-vite":
      return scaffoldVueVite(ctx);
  }
}
