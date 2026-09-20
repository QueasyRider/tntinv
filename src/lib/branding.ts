export const DEFAULT_SITE_NAME = "Twisted & Thrifted";

export function siteInitials(siteName: string): string {
  const name = siteName.trim() || DEFAULT_SITE_NAME;
  const ampersandIndex = name.indexOf("&");
  if (ampersandIndex > 0 && ampersandIndex < name.length - 1) {
    const left = name.slice(0, ampersandIndex).trim();
    const right = name.slice(ampersandIndex + 1).trim();
    return `${left[0] || ""}&${right[0] || ""}`.toUpperCase();
  }
  const words = name.match(/[\p{L}\p{N}]+/gu) || [];
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "WS";
}
