import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/theme/workspace-theme";
import "./globals.css";

const chosen = async () => (await cookies()).get(THEME_COOKIE)?.value;

/** The browser chrome and iPhone status bar follow the theme the person picked, not the device setting. */
export async function generateMetadata(): Promise<Metadata> {
  const c = await chosen();
  return {
    title: { default: "Orbit", template: "%s · Orbit" },
    description: "Company headquarters: pages, SOPs, dashboard and tasks.",
    applicationName: "Orbit",
    appleWebApp: { capable: true, title: "Orbit", statusBarStyle: c === "light" ? "default" : "black-translucent" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const c = await chosen();
  const themeColor = c === "light" ? "#f5f6fb" : c === "dark" || !c ? "#0f1526" : [{ media: "(prefers-color-scheme: light)", color: "#f5f6fb" }, { media: "(prefers-color-scheme: dark)", color: "#0f1526" }];
  return { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor };
}

/** Resolves "system" before first paint so there is never a flash of the wrong theme. */
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(dark|light|system)/);var c=m?m[1]:'dark';var t=c==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):c;document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const choice = (await cookies()).get(THEME_COOKIE)?.value;
  const initial = choice === "light" ? "light" : "dark";
  return (
    <html lang="en" data-theme={initial} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
