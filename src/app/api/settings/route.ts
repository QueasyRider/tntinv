import { apiError } from "@/lib/http";
import { getAppState, getConnection, saveConnectionConfig, updateSettings } from "@/lib/repository";
import type { AppSettings } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      settings?: Partial<AppSettings>;
      etsy?: { keystring?: string; sharedSecret?: string; shopId?: string };
      square?: { appId?: string; appSecret?: string; environment?: "sandbox" | "production"; locationId?: string };
    };
    if (body.settings) await updateSettings(body.settings);
    if (body.etsy && (body.etsy.keystring || body.etsy.sharedSecret)) {
      const previous = (await getConnection("etsy")).config;
      const keystring = body.etsy.keystring || previous?.keystring;
      const sharedSecret = body.etsy.sharedSecret || previous?.sharedSecret;
      if (!keystring || !sharedSecret) throw new Error("Etsy keystring and shared secret are both required.");
      await saveConnectionConfig("etsy", { keystring, sharedSecret, shopId: body.etsy.shopId || previous?.shopId }, body.etsy.shopId ? `Etsy shop ${body.etsy.shopId}` : "Etsy app configured");
    }
    if (body.square && (body.square.appId || body.square.appSecret)) {
      const previous = (await getConnection("square")).config;
      const appId = body.square.appId || previous?.appId;
      const appSecret = body.square.appSecret || previous?.appSecret;
      if (!appId || !appSecret) throw new Error("Square application ID and secret are both required.");
      await saveConnectionConfig("square", { appId, appSecret, environment: body.square.environment || previous?.environment || "sandbox", locationId: body.square.locationId || previous?.locationId }, "Square app configured");
    }
    return Response.json({ ok: true, state: await getAppState() });
  } catch (error) {
    return apiError(error);
  }
}
