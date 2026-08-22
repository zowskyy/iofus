import "../wander.css";
import { getCurrentUser } from "@/lib/session";
import { getWanderBatch } from "@/lib/proximityGraph";
import { WanderClient } from "./WanderClient";

/** Wander mode: full-screen profile surfing. Pre-loads a proximity-ordered batch server-side. Falls back to random pages for signed-out users or cold-start. */
export default async function WanderPage() {
  const user = await getCurrentUser();
  const handles = getWanderBatch(user?.id ?? null, 30);
  return <WanderClient handles={handles} />;
}
