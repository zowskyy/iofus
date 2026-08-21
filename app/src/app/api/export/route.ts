import { getCurrentUser } from "@/lib/session";
import { exportPageAsHtml } from "@/lib/exportPage";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return new Response("Unauthorized", { status: 401 });
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
