import type { ProjectContext } from "../types.js";

/** Stub: Vue support is selectable but not yet wired. */
export async function scaffoldVueVite(_ctx: ProjectContext): Promise<void> {
  throw new Error(
    "Vue support is coming soon. The create-vite step works (vue-ts/vue), but " +
      "auth/db/backend wiring isn't done yet — pick a React or Next.js option for now.",
  );
}
