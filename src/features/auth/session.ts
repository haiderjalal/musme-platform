import "server-only";

import { notFound, redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { logEvent } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UserRole = "learner" | "teacher" | "admin";

export interface CurrentUser {
  id: string;
  role: UserRole;
  displayName: string | null;
  timezone: string;
}

/**
 * The signed-in user with their profile, or null. Identity is verified with Supabase (getUser),
 * and the role is read from the database, never from a token claim the client could edit.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, display_name, timezone")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    logEvent("error", "auth.profile_load_failed", { code: error.code ?? null });
    throw new Error("Could not load your profile.");
  }
  if (!profile) return null;

  return {
    id: profile.id,
    role: profile.role,
    displayName: profile.display_name,
    timezone: profile.timezone,
  };
}

/** Redirects anonymous visitors to sign in and returns them to the page afterwards. */
export async function requireUser(returnPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`${ROUTES.login}?next=${encodeURIComponent(returnPath)}`);
  }
  return user;
}

/**
 * Admin pages return 404 to everyone else, so the existence of the admin area is not revealed.
 * The database also enforces this through is_admin() in row level security.
 */
export async function requireAdmin(returnPath: string): Promise<CurrentUser> {
  const user = await requireUser(returnPath);
  if (user.role !== "admin") {
    notFound();
  }
  return user;
}
