import { requireApiSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { getAppState, updateSettings } from "@/lib/repository";

export async function POST() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    await updateSettings({ setupComplete: true });
    return Response.json({ ok: true, state: await getAppState() });
  } catch (error) {
    return apiError(error);
  }
}
