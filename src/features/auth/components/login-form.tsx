"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

import { requestMagicLinkAction } from "../actions";
import { magicLinkSchema, type MagicLinkInput } from "../schemas";

interface LoginFormProps {
  next: string;
}

type Status =
  { kind: "idle" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

export function LoginForm({ next }: LoginFormProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MagicLinkInput>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: "", next },
  });

  const onSubmit = handleSubmit(async (values) => {
    setStatus({ kind: "idle" });
    const result = await requestMagicLinkAction(values);
    if (result.success) {
      setStatus({ kind: "sent", email: result.data.email });
      return;
    }
    if (result.fieldErrors?.email) {
      setError("email", { message: result.fieldErrors.email });
    }
    setStatus({ kind: "error", message: result.message });
  });

  if (status.kind === "sent") {
    return (
      <div role="status" className="grid gap-2 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm text-muted">
          We sent a sign-in link to <span className="font-semibold text-ink">{status.email}</span>.
          The link works once and expires after a short time.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <input type="hidden" {...register("next")} />
      <TextField
        label="Email address"
        type="email"
        autoComplete="email"
        inputMode="email"
        spellCheck={false}
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register("email")}
      />
      {status.kind === "error" ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {status.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? "Sending link…" : "Email me a sign-in link"}
      </Button>
      <p className="text-xs text-muted">
        No password needed. New accounts are created automatically.
      </p>
    </form>
  );
}
