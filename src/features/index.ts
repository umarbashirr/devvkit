import type { FeatureModule } from "../types.js";
import { authModule } from "./auth.js";
import { databaseModule } from "./database.js";
import { stylingModule } from "./styling.js";
import { toolingModule } from "./tooling.js";

/**
 * Ordered registry of feature modules. Order matters: styling (shadcn) and the
 * ORM scaffold run before auth so auth can reference them later if extended.
 * Add new modules here to grow the kit.
 */
export const featureModules: FeatureModule[] = [
  stylingModule,
  databaseModule,
  authModule,
  toolingModule,
];
