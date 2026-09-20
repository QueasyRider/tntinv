import "server-only";
import { cache } from "react";
import { DEFAULT_SITE_NAME } from "./branding";
import { getSettings } from "./repository";

export const getConfiguredSiteName = cache(async (): Promise<string> => {
  return getSettings().then((settings) => settings.siteName).catch(() => DEFAULT_SITE_NAME);
});
