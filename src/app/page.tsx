import { AppShell } from "@/components/app-shell";
import { requirePageSession } from "@/lib/auth";
import { getAppState } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requirePageSession();
  return <AppShell initialState={await getAppState()} />;
}
