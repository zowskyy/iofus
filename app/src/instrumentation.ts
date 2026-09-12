/**
 * Next runs `register()` exactly once per server instance and waits for it to
 * finish before serving any request, which makes it the only place a fatal
 * configuration check can run early enough to matter.
 */
export async function register(): Promise<void> {
  // `register` is invoked for the edge runtime too, where node:fs and
  // node:sqlite are unavailable. Configuration and seeding are node-only.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateProductionConfig } = await import("./lib/productionConfig");

  try {
    validateProductionConfig();
  } catch (err) {
    // Throwing is not enough on its own. Next catches anything raised here,
    // prints "Failed to prepare server", and leaves the process running with
    // its HTTP listener already bound — verified against a production build,
    // where a deliberately misconfigured boot stayed up until it was killed
    // externally. A container in that state looks alive to anything watching
    // the port while being unable to serve a request, which is precisely the
    // silent failure this check exists to prevent. Exiting makes it loud.
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Promotes IOFUS_MODERATOR_HANDLE's account when it already exists. On a
  // brand-new database nobody has signed up yet, so this is a no-op and the
  // call in the moderation page picks it up once that account is created.
  //
  // Deliberately not fatal: unlike configuration, a failure here is more
  // likely transient, and exiting would turn it into a restart loop. The
  // moderation page retries on every visit.
  try {
    const { ensureModeratorSeed } = await import("./lib/moderation");
    ensureModeratorSeed();
  } catch (err) {
    console.error("[startup] moderator seed failed:", err);
  }

  const { closeDb } = await import("./lib/db");
  let shuttingDown = false;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      // Both signals can arrive, and the platform may send a second one while
      // the first is still unwinding.
      if (shuttingDown) return;
      shuttingDown = true;
      closeDb();
      process.exit(0);
    });
  }
}
