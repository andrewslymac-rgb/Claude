import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HQ",
  description: "Company headquarters: pages, SOPs, dashboard and tasks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
