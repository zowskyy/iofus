"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markAllReadAction } from "./actions";

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await markAllReadAction();
      router.refresh();
    });
  }

  return (
    <button onClick={handleClick} disabled={pending} className="btn secondary" style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}>
      {pending ? "Marking…" : "Mark all read"}
    </button>
  );
}
