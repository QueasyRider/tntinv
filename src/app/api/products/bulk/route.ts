import { requireApiSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { bulkUpdate, getAppState } from "@/lib/repository";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json() as { ids?: string[]; operation?: { type: string; value?: string; value2?: string } };
    if (!body.ids?.length || !body.operation) throw new Error("Select products and a bulk action first.");
    const count = await bulkUpdate(body.ids, body.operation);
    return Response.json({ ok: true, count, state: await getAppState() });
  } catch (error) {
    return apiError(error);
  }
}
