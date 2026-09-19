import { requireApiSession } from "@/lib/auth";
import { getProductImage } from "@/lib/repository";

export async function GET(_request: Request, context: RouteContext<"/api/product-images/[id]">) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  const image = await getProductImage(id);
  if (!image) return new Response("Image not found.", { status: 404 });
  return new Response(Buffer.from(image.dataBase64, "base64"), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
