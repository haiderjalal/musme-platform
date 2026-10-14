import { JOIN_AFTER_END_MINUTES, JOIN_BEFORE_START_MINUTES } from "@/constants/booking";

const MINUTE_MS = 60_000;

export interface ClassTiming {
  startsAt: Date;
  endsAt: Date;
}

/** Whether the room may be joined now. The window opens early and closes shortly after the end. */
export function isWithinJoinWindow(timing: ClassTiming, now: Date): boolean {
  const opensAt = timing.startsAt.getTime() - JOIN_BEFORE_START_MINUTES * MINUTE_MS;
  const closesAt = timing.endsAt.getTime() + JOIN_AFTER_END_MINUTES * MINUTE_MS;
  return now.getTime() >= opensAt && now.getTime() <= closesAt;
}

/** The instant the join window opens, for the "opens at" message shown before the window. */
export function joinWindowOpensAt(timing: ClassTiming): Date {
  return new Date(timing.startsAt.getTime() - JOIN_BEFORE_START_MINUTES * MINUTE_MS);
}
