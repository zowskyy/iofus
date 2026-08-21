import "../wander.css";
import "../explore.css";
import { listRandomPages } from "@/lib/discovery";
import { WanderClient } from "./WanderClient";

/** Wander mode: full-screen profile surfing. Pre-loads a batch of handles server-side. */
export default function WanderPage() {
  const pages = listRandomPages(30);
  const handles = pages.map((p) => p.handle);
  return <WanderClient handles={handles} />;
}
