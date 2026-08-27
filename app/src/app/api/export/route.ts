import { getCurrentUser } from "@/lib/session";
import { exportPageAsHtml } from "@/lib/exportPage";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    checkRateLimit(await rateLimitActorKey("export", viewer.id), 10);
  } catch (e) {
    if (e instanceof RateLimitError) return new Response(e.message, { status: 429 });
    throw e;
  }

  try {
    const html = exportPageAsHtml(viewer.id);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": 'attachment; filename="my-page.html"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return new Response(message, { status: 500 });
  }
}
