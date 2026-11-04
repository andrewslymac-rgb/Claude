import "server-only";
import { Google } from "arctic";

export function googleClient() {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return new Google(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!, `${appUrl}/api/auth/google/callback`);
}
