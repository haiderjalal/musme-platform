import { describe, expect, it } from "vitest";

import {
  PEOPLE,
  SLOTS,
  actAs,
  actAsOwner,
  captureSqlState,
  createBooking,
  createWorld,
  registerTestDatabase,
} from "./helpers";

const getDb = registerTestDatabase();

const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";

async function createConversation(learnerId: string, teacherId: string): Promise<string> {
  const { rows } = await getDb().query<{ id: string }>(
    "insert into public.conversations (learner_id, teacher_id) values ($1, $2) returning id",
    [learnerId, teacherId],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Conversation insert returned no row");
  }
  return row.id;
}

async function insertMessageAsOwner(
  conversationId: string,
  senderId: string,
  body: string,
  deleted = false,
): Promise<void> {
  await getDb().query(
    "insert into public.messages (conversation_id, sender_id, body, deleted_at) values ($1, $2, $3, $4)",
    [conversationId, senderId, body, deleted ? new Date().toISOString() : null],
  );
}

describe("message body length", () => {
  it("rejects an empty body", async () => {
    const db = getDb();
    await createWorld(db);
    const conversationId = await createConversation(PEOPLE.learnerA, PEOPLE.teacherT);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, '')",
        [conversationId, PEOPLE.learnerA],
      ),
    );

    expect(state).toBe(CHECK_VIOLATION);
  });

  it("rejects a whitespace-only body", async () => {
    const db = getDb();
    await createWorld(db);
    const conversationId = await createConversation(PEOPLE.learnerA, PEOPLE.teacherT);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, '   ')",
        [conversationId, PEOPLE.learnerA],
      ),
    );

    expect(state).toBe(CHECK_VIOLATION);
  });

  it("rejects a body longer than 2000 characters", async () => {
    const db = getDb();
    await createWorld(db);
    const conversationId = await createConversation(PEOPLE.learnerA, PEOPLE.teacherT);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, $3)",
        [conversationId, PEOPLE.learnerA, "a".repeat(2001)],
      ),
    );

    expect(state).toBe(CHECK_VIOLATION);
  });

  it("accepts a body of exactly 2000 characters", async () => {
    const db = getDb();
    await createWorld(db);
    const conversationId = await createConversation(PEOPLE.learnerA, PEOPLE.teacherT);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, $3)",
        [conversationId, PEOPLE.learnerA, "a".repeat(2000)],
      ),
    );

    expect(state).toBeUndefined();
  });
});

describe("conversation creation", () => {
  it("lets a learner open a conversation when they have a booking with the teacher", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const state = await captureSqlState(db, () =>
      db.query("insert into public.conversations (learner_id, teacher_id) values ($1, $2)", [
        PEOPLE.learnerA,
        PEOPLE.teacherT,
      ]),
    );
    await actAsOwner(db);

    expect(state).toBeUndefined();
  });

  it("denies a learner without a booking", async () => {
    const db = getDb();
    await createWorld(db);
    await actAs(db, "authenticated", PEOPLE.learnerB);

    const state = await captureSqlState(db, () =>
      db.query("insert into public.conversations (learner_id, teacher_id) values ($1, $2)", [
        PEOPLE.learnerB,
        PEOPLE.teacherT,
      ]),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("denies a pair whose only booking is cancelled", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerB,
      teacherId: PEOPLE.teacherU,
      offeringId: world.offeringU,
      status: "cancelled",
      ...SLOTS.first,
    });
    await actAs(db, "authenticated", PEOPLE.learnerB);

    const state = await captureSqlState(db, () =>
      db.query("insert into public.conversations (learner_id, teacher_id) values ($1, $2)", [
        PEOPLE.learnerB,
        PEOPLE.teacherU,
      ]),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("denies a teacher opening a conversation on the learner's behalf", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });
    await actAs(db, "authenticated", PEOPLE.teacherT);

    const state = await captureSqlState(db, () =>
      db.query("insert into public.conversations (learner_id, teacher_id) values ($1, $2)", [
        PEOPLE.learnerA,
        PEOPLE.teacherT,
      ]),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });
});

describe("message writes", () => {
  it("lets a participant send a message when a booking exists", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });
    const conversationId = await createConversation(PEOPLE.learnerA, PEOPLE.teacherT);
    await actAs(db, "authenticated", PEOPLE.teacherT);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hello')",
        [conversationId, PEOPLE.teacherT],
      ),
    );
    await actAsOwner(db);

    expect(state).toBeUndefined();
  });

  it("denies a non-participant sending into the conversation", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });
    const conversationId = await createConversation(PEOPLE.learnerA, PEOPLE.teacherT);
    await actAs(db, "authenticated", PEOPLE.learnerB);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Intrude')",
        [conversationId, PEOPLE.learnerB],
      ),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("denies spoofing another user as the sender", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });
    const conversationId = await createConversation(PEOPLE.learnerA, PEOPLE.teacherT);
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Spoof')",
        [conversationId, PEOPLE.teacherT],
      ),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("denies sending once the only booking between the pair is cancelled", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerB,
      teacherId: PEOPLE.teacherU,
      offeringId: world.offeringU,
      status: "cancelled",
      ...SLOTS.first,
    });
    const conversationId = await createConversation(PEOPLE.learnerB, PEOPLE.teacherU);
    await actAs(db, "authenticated", PEOPLE.learnerB);

    const state = await captureSqlState(db, () =>
      db.query(
        "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hello')",
        [conversationId, PEOPLE.learnerB],
      ),
    );
    await actAsOwner(db);

    expect(state).toBe(PERMISSION_DENIED);
  });

  it("denies editing or deleting a sent message", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });
    const conversationId = await createConversation(PEOPLE.learnerA, PEOPLE.teacherT);
    await insertMessageAsOwner(conversationId, PEOPLE.learnerA, "Original");
    await actAs(db, "authenticated", PEOPLE.learnerA);

    const updateState = await captureSqlState(db, () =>
      db.query("update public.messages set body = 'Edited'"),
    );
    const deleteState = await captureSqlState(db, () => db.query("delete from public.messages"));
    await actAsOwner(db);

    expect(updateState).toBe(PERMISSION_DENIED);
    expect(deleteState).toBe(PERMISSION_DENIED);
  });
});

describe("message reads", () => {
  it("shows messages to participants only, and hides soft-deleted messages from them", async () => {
    const db = getDb();
    const world = await createWorld(db);
    await createBooking(db, {
      learnerId: PEOPLE.learnerA,
      teacherId: PEOPLE.teacherT,
      offeringId: world.offeringT,
      ...SLOTS.first,
    });
    const conversationId = await createConversation(PEOPLE.learnerA, PEOPLE.teacherT);
    await insertMessageAsOwner(conversationId, PEOPLE.learnerA, "Visible");
    await insertMessageAsOwner(conversationId, PEOPLE.teacherT, "Deleted", true);

    await actAs(db, "authenticated", PEOPLE.learnerA);
    const participant = await db.query<{ body: string }>(
      "select body from public.messages order by body",
    );
    await actAs(db, "authenticated", PEOPLE.learnerB);
    const outsider = await db.query<{ body: string }>("select body from public.messages");
    await actAs(db, "authenticated", PEOPLE.admin);
    const admin = await db.query<{ body: string }>(
      "select body from public.messages order by body",
    );
    await actAsOwner(db);

    expect(participant.rows.map((row) => row.body)).toEqual(["Visible"]);
    expect(outsider.rows).toEqual([]);
    expect(admin.rows.map((row) => row.body)).toEqual(["Deleted", "Visible"]);
  });
});
