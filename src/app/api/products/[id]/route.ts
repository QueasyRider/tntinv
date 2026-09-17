import { apiError } from "@/lib/http";
import { getAppState, saveProduct } from "@/lib/repository";
import type { ProductCopy } from "@/lib/types";

export async function PATCH(request: Request, context: RouteContext<"/api/products/[id]">) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { working?: ProductCopy; markReady?: boolean };
    if (!body.working) throw new Error("A working copy is required.");
    const product = await saveProduct(id, body.working, Boolean(body.markReady));
    return Response.json({ ok: true, product, state: await getAppState() });
  } catch (error) {
    return apiError(error);
  }
}
