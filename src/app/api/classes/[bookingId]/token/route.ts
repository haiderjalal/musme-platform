import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getMyBooking } from "@/features/booking/my-bookings";
import { isWithinJoinWindow } from "@/features/booking/domain/join-window";
import { getCurrentUser } from "@/features/auth/session";
import { getVideoProvider, roomNameForBooking } from "@/features/classroom/video-provider";
import { logEvent } from "@/lib/logger";
import type { ActionResult } from "@/lib/result";

const JOIN_TOKEN_TTL_SECONDS = 600;
const bookingIdSchema = z.uuid();

interface RouteContext {
  params: Promise<{ bookingId: string }>;
}

/**
 * Issues a short-lived join token for a class. Four checks must all pass, in order: the caller is
 * signed in, the booking is one they are a party to, the booking is confirmed, and the join window
 * is open. The room name comes from the booking, so callers cannot pick a room.
 */
export async function POST(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { bookingId } = await context.params;
  const parsedId = bookingIdSchema.safeParse(bookingId);
  if (!parsedId.success) {
    return respond(404, { success: false, message: "Lesson not found." });
  }

  const user = await getCurrentUser();
  if (!user) {
    return respond(401, { success: false, message: "Sign in to join this lesson." });
  }

  const booking = await getMyBooking(parsedId.data);
  if (!booking) {
    return respond(404, { success: false, message: "Lesson not found." });
  }
  if (booking.status !== "confirmed" && booking.status !== "in_progress") {
    return respond(409, { success: false, message: "This lesson is not confirmed yet." });
  }
  if (!isWithinJoinWindow(booking, new Date())) {
    return respond(403, {
      success: false,
      message: "The classroom opens 10 minutes before the lesson.",
    });
  }

  const provider = getVideoProvider();
  if (!provider) {
    logEvent("warn", "classroom.provider_not_configured");
    return respond(503, { success: false, message: "Live video is not connected yet." });
  }

  const token = await provider.issueJoinToken({
    roomName: roomNameForBooking(booking.id),
    participantId: user.id,
    canPublish: true,
    ttlSeconds: JOIN_TOKEN_TTL_SECONDS,
  });
  logEvent("info", "classroom.token_issued", { bookingId: booking.id });
  return respond(200, { success: true, message: "Joining.", data: { token } });
}

function respond<T>(
  status: number,
  body: ActionResult<T> | { success: false; message: string },
): NextResponse {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
