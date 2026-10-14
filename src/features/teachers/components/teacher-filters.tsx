import type { InstrumentRef } from "../types";

interface TeacherFiltersProps {
  instruments: InstrumentRef[];
  selected?: string;
  query?: string;
}

/**
 * A plain GET form, so filtering works before JavaScript loads and the filtered URL can be shared.
 * Results are rendered on the server from the URL, so filters are never stored in client state.
 */
export function TeacherFilters({ instruments, selected, query }: TeacherFiltersProps) {
  return (
    <form
      method="get"
      role="search"
      aria-label="Find a teacher"
      className="grid gap-3 sm:grid-cols-[1fr_auto]"
    >
      <div className="grid gap-1.5">
        <label htmlFor="teacher-search" className="text-sm font-semibold">
          Search by headline
        </label>
        <input
          id="teacher-search"
          name="q"
          type="search"
          defaultValue={query ?? ""}
          maxLength={80}
          placeholder="For example: bandish, beginners, Qawwali"
          className="min-h-11 rounded-xl border border-line bg-surface px-3 text-ink placeholder:text-muted"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="teacher-instrument" className="text-sm font-semibold">
          Instrument
        </label>
        <select
          id="teacher-instrument"
          name="instrument"
          defaultValue={selected ?? ""}
          className="min-h-11 rounded-xl border border-line bg-surface px-3 text-ink"
        >
          <option value="">All instruments</option>
          {instruments.map((instrument) => (
            <option key={instrument.id} value={instrument.slug}>
              {instrument.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <button
          type="submit"
          className="min-h-11 w-full cursor-pointer rounded-xl bg-ink px-5 font-semibold text-bg sm:w-auto"
        >
          Show teachers
        </button>
      </div>
    </form>
  );
}
