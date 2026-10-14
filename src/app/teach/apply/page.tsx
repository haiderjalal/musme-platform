import type { Metadata } from "next";
import { connection } from "next/server";

import { ROUTES } from "@/constants/routes";
import { requireUser } from "@/features/auth/session";
import { listInstruments } from "@/features/teachers/instrument-repository";
import { getOwnApplicationForm } from "@/features/teach/queries";
import { TeacherApplicationForm } from "@/features/teach/components/teacher-application-form";
import type { TeacherApplicationFormValues } from "@/features/teach/schemas";

export const metadata: Metadata = {
  title: "Teacher application",
  robots: { index: false, follow: false },
};

export default async function TeacherApplyPage(): Promise<React.ReactElement> {
  await connection();
  const user = await requireUser(ROUTES.teachApply);
  const [instruments, existing] = await Promise.all([
    listInstruments(),
    getOwnApplicationForm(user.id),
  ]);

  const defaults: TeacherApplicationFormValues = {
    displayName: user.displayName ?? "",
    slug: existing?.slug ?? "",
    headline: existing?.headline ?? "",
    bio: existing?.bio ?? "",
    languages: existing?.languages.join(", ") ?? "",
    instrumentIds: existing?.instrumentIds ?? [],
    timezone: user.timezone,
  };

  return (
    <main id="main" className="mx-auto grid max-w-2xl gap-8 px-4 pb-20 pt-10">
      <header className="grid gap-2">
        <h1 className="text-3xl font-bold">
          {existing ? "Edit your application" : "Apply to teach"}
        </h1>
        <p className="text-muted">
          Tell learners who you are and what you teach. Your application is reviewed before your
          profile appears.
        </p>
      </header>
      <TeacherApplicationForm instruments={instruments} defaults={defaults} />
    </main>
  );
}
