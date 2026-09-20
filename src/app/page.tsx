import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { requirePageSession } from "@/lib/auth";
import { getConfiguredSiteName } from "@/lib/branding-server";
import { getAppState } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${await getConfiguredSiteName()} — Inventory Transfer` };
}

export default async function Home() {
  await requirePageSession();
  return <AppShell initialState={await getAppState()} />;
}
