import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { CreateRingForm } from "./CreateRingForm";

export default async function NewRingPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/rings/new");

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Web Rings
      </p>
      <h1>Create a ring</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        A web ring connects pages around a theme. Members can hop between pages in the ring.
      </p>
      <CreateRingForm />
    </main>
  );
}
