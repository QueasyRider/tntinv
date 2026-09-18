import { requireApiSession } from "@/lib/auth";
import { getAppState } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  return Response.json(await getAppState());
}
