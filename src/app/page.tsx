import { AppShell } from "@/components/app-shell";
import { getAppState } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <AppShell initialState={await getAppState()} />;
}
