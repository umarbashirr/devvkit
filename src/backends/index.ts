import type { BackendId, Language, ProjectContext } from "../types.js";
import { scaffoldExpress } from "./express.js";

export interface BackendChoice {
  value: string;
  label: string;
  hint: string;
  backend: BackendId;
  language: Language;
}

export const BACKEND_CHOICES: BackendChoice[] = [
  { value: "none", label: "None", hint: "frontend only", backend: "none", language: "ts" },
  { value: "express-ts", label: "Express (TS)", hint: "Node", backend: "express", language: "ts" },
  { value: "express-js", label: "Express (JS)", hint: "Node", backend: "express", language: "js" },
];

export function backendChoiceByValue(value: string): BackendChoice | undefined {
  return BACKEND_CHOICES.find((c) => c.value === value);
}

/** Scaffold the chosen backend into ctx.apiDir (no-op for "none"). */
export async function scaffoldBackend(ctx: ProjectContext): Promise<void> {
  if (ctx.backend === "express") return scaffoldExpress(ctx);
}
