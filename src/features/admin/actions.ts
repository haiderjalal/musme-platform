"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { requireAdmin } from "@/features/auth/session";
import { logEvent } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const reviewFormSchema = z
  .object({
    teacherId: z.uuid(),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.decision !== "reject" || (value.reason ?? "").length >= 10, {
    message: "Give the teacher a reason of at least 10 characters.",
    path: ["reason"],
  });

/**
 * Approves or rejects a teacher application. The decision is made by the admin_review_teacher
 * database function, which checks is_admin() and writes the audit log in the same transaction.
 * This action only passes the decision through; the database is the authority.
 */
export async function reviewTeacherFormAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin(ROUTES.admin);
  const parsed = reviewFormSchema.safeParse({
    teacherId: formData.get("teacherId"),
    decision: formData.get("decision"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    redirect(`${ROUTES.admin}?notice=review-invalid`);
  }

  const { teacherId, decision, reason } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_review_teacher", {
    p_teacher_id: teacherId,
    p_status: decision === "approve" ? "approved" : "rejected",
    p_reason: decision === "reject" ? (reason ?? null) : null,
  });

  if (error) {
    logEvent("error", "admin.review_failed", { code: error.code ?? null, adminId: admin.id });
    redirect(`${ROUTES.admin}?notice=review-failed`);
  }

  logEvent("info", "admin.teacher_reviewed", { teacherId, decision, adminId: admin.id });
  redirect(`${ROUTES.admin}?notice=reviewed`);
}
