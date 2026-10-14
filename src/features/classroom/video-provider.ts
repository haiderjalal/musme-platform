import "server-only";

export interface JoinTokenRequest {
  roomName: string;
  participantId: string;
  canPublish: boolean;
  /** Token lifetime in seconds. The product plan asks for 5 to 10 minutes, refreshed while connected. */
  ttlSeconds: number;
}

/**
 * The seam between the classroom and a live video provider (LiveKit or Agora, pending the
 * Phase 0 spike in docs/decisions.md). Tokens are minted on the server only.
 */
export interface VideoProvider {
  readonly name: string;
  issueJoinToken(request: JoinTokenRequest): Promise<string>;
}

/** Null until a provider is configured. Callers must return a clear "not connected" response. */
export function getVideoProvider(): VideoProvider | null {
  return null;
}

/** Room names come from the booking ID only. Nothing user-supplied reaches the provider. */
export function roomNameForBooking(bookingId: string): string {
  return `musme-${bookingId}`;
}
