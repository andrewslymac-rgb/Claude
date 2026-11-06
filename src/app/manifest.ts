import type { MetadataRoute } from "next";

/** Lets phones "install" Orbit to the home screen and open it full-screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orbit",
    short_name: "Orbit",
    description: "Company headquarters: pages, SOPs, tasks and AI.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1526",
    theme_color: "#0f1526",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
