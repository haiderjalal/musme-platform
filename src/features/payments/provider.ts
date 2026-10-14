import "server-only";

import type { ActionResult } from "@/lib/result";

export interface CheckoutRequest {
  bookingId: string;
  amountMinor: number;
  currency: string;
}

export interface CheckoutSession {
  url: string;
}

/**
 * The seam between MUSME and a payment provider. Nothing here names a provider, because the
 * provider is an open business decision (docs/decisions.md). Each provider implements this
 * interface, and the booking flow depends only on the interface.
 */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(request: CheckoutRequest): Promise<ActionResult<CheckoutSession>>;
}

/**
 * Returns the configured provider, or null. Until a provider is chosen, bookings stay in
 * pending_payment and the UI says online payment is not enabled yet. No booking is confirmed
 * without a payment, so nothing is charged or promised by mistake.
 */
export function getPaymentProvider(): PaymentProvider | null {
  return null;
}
