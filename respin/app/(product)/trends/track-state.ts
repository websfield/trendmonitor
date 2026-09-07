import type { BillingErrorCode } from "../billing-errors";

export type TrackNicheActionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "saved" }>
  | Readonly<{ status: "removed" }>
  | Readonly<{ status: "refused"; code: BillingErrorCode }>;

export const IDLE_TRACK_NICHE_STATE: TrackNicheActionState = { status: "idle" };
