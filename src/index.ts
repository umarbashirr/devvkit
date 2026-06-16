import * as p from "@clack/prompts";
import pc from "picocolors";

import { main } from "./cli.js";

main(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  p.log.error(pc.red(message));
  process.exit(1);
});
