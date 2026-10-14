"use client";

import { ErrorState } from "@/components/shared/state-panels";

interface RootErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Last-resort boundary for any route without its own error.tsx. The error object is not rendered:
 * its message can contain internal detail, so visitors see a friendly message and a retry button.
 */
export default function RootError({ reset }: RootErrorProps): React.ReactElement {
  return (
    <main id="main" className="mx-auto grid min-h-dvh max-w-md content-center px-4">
      <ErrorState onRetry={reset} />
    </main>
  );
}
