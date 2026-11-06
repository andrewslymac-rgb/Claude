import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for iPhone/iPad ("Add to Home Screen"). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, background: "#0f1526", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="124" height="124" viewBox="0 0 32 32" fill="none">
          <path d="M16 4.5a11.5 11.5 0 0 1 11.3 13.6" stroke="#8f9ff5" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M16 27.5A11.5 11.5 0 0 1 4.7 13.9" stroke="#8f9ff5" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="16" cy="16" r="3.2" stroke="#8f9ff5" strokeWidth="2.6" />
          <circle cx="26.3" cy="7.2" r="2.1" fill="#8f9ff5" />
          <circle cx="5.7" cy="24.8" r="2.1" fill="#8f9ff5" />
        </svg>
      </div>
    ),
    size,
  );
}
