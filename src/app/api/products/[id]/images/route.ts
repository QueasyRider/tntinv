import { requireApiSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { storedProductImageSource } from "@/lib/product-images";
import { saveProductImage } from "@/lib/repository";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/pjpeg", "image/png", "image/gif"]);
const MAX_IMAGE_BYTES = 1_500_000;

export async function POST(request: Request, context: RouteContext<"/api/products/[id]/images">) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    const { id: productId } = await context.params;
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File)) throw new Error("Choose an image to upload.");
    if (!ALLOWED_IMAGE_TYPES.has(image.type)) throw new Error("Use a JPEG, PNG, or GIF image.");
    if (!image.size) throw new Error("The selected image is empty.");
    if (image.size > MAX_IMAGE_BYTES) throw new Error("The prepared image is too large. Choose a smaller image and try again.");
    const imageId = await saveProductImage(productId, image.name || "product-photo", image.type, Buffer.from(await image.arrayBuffer()).toString("base64"));
    return Response.json({ ok: true, source: storedProductImageSource(imageId) });
  } catch (error) {
    return apiError(error);
  }
}
