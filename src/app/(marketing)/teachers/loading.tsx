import { SkeletonBlock } from "@/components/shared/state-panels";

/** Same footprint as the loaded page, so nothing jumps when the teachers arrive. */
export default function TeachersLoading(): React.ReactElement {
  return (
    <main
      id="main"
      aria-busy="true"
      aria-label="Loading teachers"
      className="mx-auto grid max-w-6xl gap-8 px-4 pb-20 pt-10"
    >
      <div className="grid gap-3">
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="h-10 w-full max-w-xl" />
        <SkeletonBlock className="h-5 w-full max-w-prose" />
      </div>
      <SkeletonBlock className="h-28 w-full" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonBlock key={index} className="h-56 w-full" />
        ))}
      </div>
    </main>
  );
}
