"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import type { InstrumentRef } from "@/features/teachers/types";

import { saveTeacherApplicationAction } from "../actions";
import {
  teacherApplicationFormSchema,
  toApplicationInput,
  type TeacherApplicationFormValues,
} from "../schemas";

interface TeacherApplicationFormProps {
  instruments: InstrumentRef[];
  defaults: TeacherApplicationFormValues;
}

const TEACHER_FIELDS = new Set<keyof TeacherApplicationFormValues>([
  "displayName",
  "slug",
  "headline",
  "bio",
  "languages",
  "instrumentIds",
  "timezone",
]);

export function TeacherApplicationForm({ instruments, defaults }: TeacherApplicationFormProps) {
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TeacherApplicationFormValues>({
    resolver: zodResolver(teacherApplicationFormSchema),
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    const result = await saveTeacherApplicationAction(toApplicationInput(values));
    if (result.success) {
      setMessage({ tone: "ok", text: result.message });
      return;
    }
    for (const [field, text] of Object.entries(result.fieldErrors ?? {})) {
      if (isFormField(field)) setError(field, { message: text });
    }
    setMessage({ tone: "error", text: result.message });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <TextField
        label="Your name"
        autoComplete="name"
        error={errors.displayName?.message}
        {...register("displayName")}
      />
      <TextField
        label="Web address"
        hint="Your profile lives at /teachers/your-address. Letters, numbers and hyphens only. It cannot change after you save."
        error={errors.slug?.message}
        {...register("slug")}
      />
      <TextField
        label="Headline"
        hint="One line learners see first, for example: Hindustani vocal teacher for adult beginners."
        error={errors.headline?.message}
        {...register("headline")}
      />
      <TextAreaField label="About you" error={errors.bio?.message} {...register("bio")} />
      <TextField
        label="Languages"
        hint="Separate with commas, for example: Urdu, English"
        error={errors.languages?.message}
        {...register("languages")}
      />

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Instruments you teach</legend>
        {instruments.length === 0 ? (
          <p className="text-sm text-muted">The instrument list is not available yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {instruments.map((instrument) => (
              <label
                key={instrument.id}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 has-checked:border-primary has-checked:bg-surface-2"
              >
                <input
                  type="checkbox"
                  value={instrument.id}
                  className="size-4 accent-primary"
                  {...register("instrumentIds")}
                />
                {instrument.name}
              </label>
            ))}
          </div>
        )}
        {errors.instrumentIds?.message ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {errors.instrumentIds.message}
          </p>
        ) : null}
      </fieldset>

      <TextField
        label="Your time zone"
        hint="Used to show your availability correctly."
        error={errors.timezone?.message}
        {...register("timezone")}
      />

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={
            message.tone === "error"
              ? "text-sm font-medium text-danger"
              : "text-sm font-medium text-ok"
          }
        >
          {message.text}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save application"}
      </Button>
    </form>
  );
}

function isFormField(field: string): field is keyof TeacherApplicationFormValues {
  return TEACHER_FIELDS.has(field as keyof TeacherApplicationFormValues);
}
