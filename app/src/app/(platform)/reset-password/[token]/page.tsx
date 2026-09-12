import { notFound } from "next/navigation";
import { verifyResetToken } from "@/lib/passwordReset";
import { ResetPasswordForm } from "./ResetPasswordForm";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ResetPasswordPage({ params }: Props) {
  const { token } = await params;
  const userId = verifyResetToken(token);
  if (!userId) notFound();

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        iofus
      </p>
      <h1>Choose a new password</h1>
      <ResetPasswordForm token={token} />
    </main>
  );
}
