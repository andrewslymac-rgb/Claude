import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Orbit", template: "%s · Orbit" },
  description: "Company headquarters: pages, SOPs, dashboard and tasks.",
  applicationName: "Orbit",
  appleWebApp: { capable: true, title: "Orbit", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0f1526" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
