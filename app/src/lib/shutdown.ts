import { closeDb } from "./db";

let registered = false;

/**
 * Closes the database cleanly when the platform asks the process to stop.
 *
 * Render stops the old instance before starting the new one when a disk is
 * attached, so shutdown is the moment the SQLite file is handed over; closing
 * here checkpoints the write-ahead log instead of leaving it for the next
 * process to recover.
 *
 * Lives in its own module, loaded by a dynamic import from the node-only
 * branch of instrumentation.ts. Next compiles instrumentation for the edge
 * runtime as well, where `process.on` and `process.exit` do not exist, and
 * calling them there is a build-time warning even when guarded at runtime.
 */
export function registerShutdownHandlers(): void {
  if (registered) return;
  registered = true;

  let shuttingDown = false;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      // Both signals can arrive, and a platform may send a second one while
      // the first is still unwinding.
      if (shuttingDown) return;
      shuttingDown = true;
      closeDb();
      process.exit(0);
    });
  }
}
