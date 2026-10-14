"use client";

import { useFormStatus } from "react-dom";

import { Button } from "./button";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface SubmitButtonProps {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  className?: string;
  name?: string;
  value?: string;
}

/**
 * Disables itself while its form submits, so a double click cannot send the same action twice.
 * Pairs with idempotency keys on the server for anything that writes money or bookings.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant,
  className,
  name,
  value,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
