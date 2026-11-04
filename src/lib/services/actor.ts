/** Who is making a change. Every write in the app goes through a service with an Actor. */
export type Actor =
  | { type: "user"; userId: string }
  | { type: "ai"; tokenId: string; userId: string | null } // Milestone 4
  | { type: "sync"; userId: null }; // Milestone 3 (Google Drive)

export const actorUserId = (a: Actor) => (a.type === "sync" ? null : a.userId);
