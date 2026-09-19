import { requireApiSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { getImportReviewData, markImportReviewsReviewed } from "@/lib/repository";

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    const runId = new URL(request.url).searchParams.get("runId") || undefined;
    return Response.json({ ok: true, data: await getImportReviewData(runId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json().catch(() => ({})) as { runId?: string; reviewId?: string };
    const runId = body.runId?.trim();
    if (!runId) throw new Error("Choose an import run to review.");
    const count = await markImportReviewsReviewed(runId, body.reviewId?.trim() || undefined);
    return Response.json({ ok: true, count, data: await getImportReviewData(runId) });
  } catch (error) {
    return apiError(error);
  }
}
