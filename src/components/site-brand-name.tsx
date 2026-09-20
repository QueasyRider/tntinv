import { DEFAULT_SITE_NAME } from "@/lib/branding";

export function SiteBrandName({ siteName }: { siteName: string }) {
  const name = siteName.trim() || DEFAULT_SITE_NAME;
  const ampersandIndex = name.indexOf("&");
  if (ampersandIndex > 0 && ampersandIndex < name.length - 1) {
    const left = name.slice(0, ampersandIndex).trim();
    const right = name.slice(ampersandIndex + 1).trim();
    return <><span>{left} <em>&amp;</em></span><span>{right}</span></>;
  }
  return <span className="brand-name-single">{name}</span>;
}
