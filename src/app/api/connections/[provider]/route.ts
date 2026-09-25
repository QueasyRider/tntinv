import { requireApiSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { clearConnection, getAppState } from "@/lib/repository";

export async function DELETE(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    const { provider } = await context.params;
    if (provider !== "etsy" && provider !== "square") throw new Error("Unknown provider.");
    await clearConnection(provider);
    return Response.json({ ok: true, state: await getAppState() });
  } catch (error) {
    return apiError(error);
  }
}
