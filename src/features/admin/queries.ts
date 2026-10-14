import "server-only";

import { z } from "zod";

import { logEvent } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PendingTeacher {
  profileId: string;
  displayName: string;
  headline: string;
  submittedAt: Date;
  slug: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: Date;
}

const pendingRow = z.object({
  profile_id: z.uuid(),
  slug: z.string(),
  headline: z.string(),
  created_at: z.string(),
  profiles: z.object({ display_name: z.string().nullable() }),
});

const auditRow = z.object({
  id: z.uuid(),
  action: z.string(),
  target_type: z.string(),
  target_id: z.uuid().nullable(),
  created_at: z.string(),
});

/** Applications waiting for a decision, oldest first. Admin-only through row level security. */
export async function listPendingTeachers(): Promise<PendingTeacher[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("teacher_profiles")
    .select("profile_id, slug, headline, created_at, profiles(display_name)")
    .eq("verification_status", "submitted")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    logEvent("error", "admin.pending_load_failed", { code: error.code ?? null });
    throw new Error("Could not load applications.");
  }
  return z
    .array(pendingRow)
    .parse(data ?? [])
    .map((row) => ({
      profileId: row.profile_id,
      displayName: row.profiles.display_name ?? "Unnamed applicant",
      headline: row.headline,
      submittedAt: new Date(row.created_at),
      slug: row.slug,
    }));
}

/** The most recent admin actions, for accountability. */
export async function listRecentAudit(limit = 50): Promise<AuditEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id, action, target_type, target_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logEvent("error", "admin.audit_load_failed", { code: error.code ?? null });
    throw new Error("Could not load the audit log.");
  }
  return z
    .array(auditRow)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      createdAt: new Date(row.created_at),
    }));
}
