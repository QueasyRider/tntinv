import { testEtsyConnection } from "@/lib/etsy";
import { apiError } from "@/lib/http";
import { addActivity, getAppState, getSettings } from "@/lib/repository";
import { testSquareConnection } from "@/lib/square";

export async function POST(_request: Request, context: RouteContext<"/api/connections/[provider]/test">) {
  try {
    const { provider } = await context.params;
    if (provider !== "etsy" && provider !== "square") throw new Error("Unknown connection provider.");
    const settings = await getSettings();
    const label = settings.mode === "demo"
      ? `Demo mode only — live ${provider === "etsy" ? "Etsy" : "Square"} connection was not tested.`
      : provider === "etsy" ? await testEtsyConnection() : await testSquareConnection();
    if (settings.mode === "demo") await addActivity("connection", `${provider === "etsy" ? "Etsy" : "Square"} test skipped`, label);
    return Response.json({ ok: true, label, state: await getAppState() });
  } catch (error) {
    return apiError(error);
  }
}
