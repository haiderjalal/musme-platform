/*
 * Business settings. Values marked PLACEHOLDER are engineering defaults the founder has not
 * confirmed yet (see docs/decisions.md). Change them here, in one place.
 */

/** Lesson lengths offered to learners. Matches the database check constraint. */
export const LESSON_DURATIONS_MINUTES = [30, 45, 60] as const;

/** Slot start times are offered every this many minutes. PLACEHOLDER. */
export const SLOT_STEP_MINUTES = 30;

/** Earliest a class may start after a booking is made. PLACEHOLDER. */
export const MIN_NOTICE_MINUTES = 60;

/** How far ahead learners can see and book slots. PLACEHOLDER. */
export const BOOKING_WINDOW_DAYS = 14;

/** A pending booking holds its slot this long while payment is completed (product plan section 10). */
export const HOLD_MINUTES = 15;

/** Join window around a class (product plan section 7). */
export const JOIN_BEFORE_START_MINUTES = 10;
export const JOIN_AFTER_END_MINUTES = 15;

/** Chat message limit (product plan section 8). */
export const MAX_MESSAGE_LENGTH = 2000;
