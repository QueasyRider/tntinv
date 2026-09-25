import { requireApiSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { getSystemHealth } from "@/lib/system-health";

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    return Response.json({ ok: true, health: await getSystemHealth() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
