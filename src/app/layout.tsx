import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inventory Transfer",
  description: "A safe Etsy-to-Square inventory transfer workspace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
