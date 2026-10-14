"use client";

import { ErrorState } from "@/components/shared/state-panels";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Error boundary for the teacher listing. The raw error is not shown to visitors. */
export default function TeachersError({ reset }: ErrorBoundaryProps): React.ReactElement {
  return (
    <main id="main" className="mx-auto grid max-w-3xl gap-6 px-4 py-16">
      <ErrorState onRetry={reset} />
    </main>
  );
}
