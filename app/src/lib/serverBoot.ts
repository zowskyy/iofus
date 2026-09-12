import { validateProductionConfig } from "./productionConfig";
import { registerShutdownHandlers } from "./shutdown";

/**
 * Everything that must happen once, before the server accepts a request.
 *
 * Kept out of instrumentation.ts because Next compiles that file for the edge
 * runtime too, and `process.exit` is a build-time warning there even inside a
 * branch that only ever runs under Node. Reaching this module at all requires
 * the dynamic import in instrumentation's node-only path.
 */
export async function bootNodeServer(): Promise<void> {
  try {
    validateProductionConfig();
  } catch (err) {
    // Throwing is not enough on its own. Next catches anything raised from
    // register(), prints "Failed to prepare server", and leaves the process
    // running with its HTTP listener already bound -- verified against a
    // production build, where a deliberately misconfigured boot stayed up
    // until killed externally. A container in that state passes a port check
    // while being unable to serve a request, which is precisely the silent
    // failure this check exists to prevent.
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Promotes IOFUS_MODERATOR_HANDLE's account when it already exists. On a
  // brand-new database nobody has signed up yet, so this is a no-op and the
  // call in the moderation page picks it up once that account is created.
  //
  // Deliberately not fatal: unlike configuration, a failure here is more
  // likely transient, and exiting would turn it into a restart loop.
  try {
    const { ensureModeratorSeed } = await import("./moderation");
    ensureModeratorSeed();
  } catch (err) {
    console.error("[startup] moderator seed failed:", err);
  }

  registerShutdownHandlers();
}
