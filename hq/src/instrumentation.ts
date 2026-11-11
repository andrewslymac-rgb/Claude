/** Runs once when the server starts: background Drive sync every 10 minutes, plus two-way pushes. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { syncAll } = await import("@/lib/drive/sync");
  const minutes = Number(process.env.DRIVE_SYNC_MINUTES ?? 10);
  setTimeout(() => void syncAll(), 20_000); // first pass shortly after boot
  setInterval(() => void syncAll(), minutes * 60_000);
  // Two-way areas: send Orbit edits to Google Docs about a minute after people stop typing.
  // Morning digest emails: checked every 10 minutes, sent once a day after 7 AM Pacific.
  const { sendDailyDigests } = await import("@/lib/services/digest");
  setTimeout(() => void sendDailyDigests().catch((e) => console.error("Digest failed", e)), 45_000); // catch up after a restart
  setInterval(() => void sendDailyDigests().catch((e) => console.error("Digest failed", e)), 10 * 60_000);
  const { pushAllPending } = await import("@/lib/drive/twoway");
  setInterval(() => void pushAllPending().catch((e) => console.error("Two-way push failed", e)), 30_000);
}
