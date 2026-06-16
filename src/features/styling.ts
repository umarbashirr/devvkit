import type { FeatureModule } from "../types.js";
import { run } from "../utils/exec.js";
import { dlxCmd } from "../utils/pm.js";

/**
 * Tailwind itself is enabled via create-next-app's --tailwind flag.
 * This module layers shadcn/ui on top: init + a couple of starter components.
 */
export const stylingModule: FeatureModule = {
  id: "styling",
  title: "Tailwind + shadcn/ui",
  enabled: (ctx) => ctx.features.styling,
  async apply(ctx) {
    const pm = ctx.packageManager;
    // Initialize shadcn with defaults (Tailwind already present).
    await run(dlxCmd(pm, ["shadcn@latest", "init", "-d"]), { cwd: ctx.dir });
    // Seed a few common components so the project isn't empty.
    await run(dlxCmd(pm, ["shadcn@latest", "add", "button", "card", "input", "-y"]), {
      cwd: ctx.dir,
    });
  },
};
