/**
 * Next runs `register()` exactly once per server instance and waits for it to
 * finish before serving any request, which makes it the only place a fatal
 * configuration check can run early enough to matter.
 *
 * Deliberately thin: this file is compiled for the edge runtime as well as
 * Node, so the actual work lives behind a dynamic import that the edge bundle
 * never reaches.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { bootNodeServer } = await import("./lib/serverBoot");
  await bootNodeServer();
}
