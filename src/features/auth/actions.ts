"use server";

import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { logEvent } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/result";
import { safeNextPath } from "@/utils/safe-next-path";
import { getSiteUrl } from "@/lib/site-url";

import { magicLinkSchema, type MagicLinkInput } from "./schemas";

/** Sends a one-time sign-in link. Supabase rate limits sends per address and per project. */
export async function requestMagicLinkAction(
  input: MagicLinkInput,
): Promise<ActionResult<{ email: string }>> {
  const parsed = magicLinkSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Check the highlighted field.", {
      email: "Enter a valid email address.",
    });
  }

  const callback = new URL("/auth/callback", getSiteUrl());
  callback.searchParams.set("next", safeNextPath(parsed.data.next));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: callback.toString(), shouldCreateUser: true },
  });

  if (error) {
    logEvent("error", "auth.magic_link_failed", {
      code: error.code ?? null,
      status: error.status ?? null,
    });
    return fail("We could not send the sign-in link. Wait a few minutes and try again.");
  }

  return ok({ email: parsed.data.email }, "Check your email for a sign-in link.");
}

/** Signs out and returns to the home page. Implemented as a server action, so it is CSRF-protected. */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    logEvent("warn", "auth.sign_out_failed", { code: error.code ?? null });
  }
  redirect(ROUTES.home);
}
