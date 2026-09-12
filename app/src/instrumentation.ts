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
  validateProductionConfig();

  // Promotes IOFUS_MODERATOR_HANDLE's account when it already exists. On a
  // brand-new database nobody has signed up yet, so this is a no-op and the
  // call in the moderation page picks it up once that account is created.
  const { ensureModeratorSeed } = await import("./lib/moderation");
  ensureModeratorSeed();
}
