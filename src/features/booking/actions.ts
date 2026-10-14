"use server";

import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { requireUser } from "@/features/auth/session";
import { logEvent } from "@/lib/logger";

import { createTrialHold, type HoldNotice } from "./hold";
import { holdRequestSchema } from "./schemas";

/**
 * Form action for a slot button. It redirects on both success and failure, so it works without
 * JavaScript. Failures come back as a short notice code, never as raw error text.
 */
export async function requestLessonFormAction(formData: FormData): Promise<void> {
  const raw = {
    teacherSlug: formData.get("teacherSlug"),
    offeringId: formData.get("offeringId"),
    startsAt: formData.get("startsAt"),
    idempotencyKey: formData.get("idempotencyKey"),
  };
  const parsed = holdRequestSchema.safeParse(raw);
  if (!parsed.success) {
    logEvent("warn", "booking.invalid_form");
    redirect(`${ROUTES.home}?notice=hold-failed`);
  }

  const { teacherSlug, offeringId, startsAt, idempotencyKey } = parsed.data;
  const teacherPath = ROUTES.teacher(teacherSlug);
  const user = await requireUser(teacherPath);

  const result = await createTrialHold({
    learnerId: user.id,
    offeringId,
    startsAt: new Date(startsAt),
    idempotencyKey,
    now: new Date(),
  });

  if (!result.success) {
    const notice: HoldNotice = result.notice ?? "hold-failed";
    redirect(`${teacherPath}?notice=${notice}`);
  }

  redirect(`${ROUTES.learnBookings}?held=${result.data.bookingId}`);
}
