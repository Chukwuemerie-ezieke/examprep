import { describe, it, expect } from "vitest";
import {
  computeLeaderboard,
  LEADERBOARD_MIN_SESSIONS,
  LEADERBOARD_LIMIT,
  type LeaderboardUserRow,
} from "../server/leaderboard";

// NOTE ON TEST SCOPE: filtered-vs-global aggregation (the optional
// examBodyId/subjectId WHERE clauses) is exercised at the STORAGE layer, since
// computeLeaderboard operates purely on already-aggregated rows. These unit
// tests therefore drive the pure ranking / threshold / tie-break / limit /
// self-standing behavior with in-memory row fixtures and no Postgres, mirroring
// tests/analytics.test.ts.

// Build a minimal aggregated leaderboard row. Override per test.
function makeRow(overrides: Partial<LeaderboardUserRow> & { userId: number }): LeaderboardUserRow {
  return {
    userId: overrides.userId,
    displayName: null,
    showOnLeaderboard: true,
    completedSessions: LEADERBOARD_MIN_SESSIONS,
    avgScore: 50,
    questionsAnswered: 10,
    ...overrides,
  };
}

describe("computeLeaderboard", () => {
  it("returns empty entries and null me for empty input", () => {
    expect(computeLeaderboard([])).toEqual({ entries: [], me: null });
  });

  it("excludes users below the minimum-sessions threshold from entries", () => {
    const rows = [
      makeRow({ userId: 1, displayName: "Ada", completedSessions: LEADERBOARD_MIN_SESSIONS - 1, avgScore: 90 }),
      makeRow({ userId: 2, displayName: "Ben", completedSessions: LEADERBOARD_MIN_SESSIONS, avgScore: 70 }),
    ];
    const result = computeLeaderboard(rows);
    expect(result.entries.map((e) => e.label)).toEqual(["Ben"]);
  });

  it("excludes opted-out users from entries but still computes them in me", () => {
    const rows = [
      makeRow({ userId: 1, displayName: "Ada", showOnLeaderboard: false, avgScore: 95, completedSessions: 5 }),
      makeRow({ userId: 2, displayName: "Ben", showOnLeaderboard: true, avgScore: 60, completedSessions: 5 }),
    ];
    const result = computeLeaderboard(rows, { viewerUserId: 1 });
    // Opted-out Ada is not in the public entries.
    expect(result.entries.map((e) => e.label)).toEqual(["Ben"]);
    // But she still gets her own self-standing (unranked, opted out).
    expect(result.me).toMatchObject({
      rank: null,
      ranked: false,
      optedIn: false,
      belowThreshold: false,
      avgScore: 95,
    });
  });

  it("ranks by avgScore desc and assigns 1..N ranks", () => {
    const rows = [
      makeRow({ userId: 1, displayName: "Low", avgScore: 40, completedSessions: 4 }),
      makeRow({ userId: 2, displayName: "High", avgScore: 90, completedSessions: 4 }),
      makeRow({ userId: 3, displayName: "Mid", avgScore: 70, completedSessions: 4 }),
    ];
    const result = computeLeaderboard(rows);
    expect(result.entries.map((e) => [e.rank, e.label])).toEqual([
      [1, "High"],
      [2, "Mid"],
      [3, "Low"],
    ]);
  });

  it("tie-breaks equal avgScore by questionsAnswered desc, then userId asc", () => {
    const rows = [
      makeRow({ userId: 5, displayName: "A", avgScore: 80, questionsAnswered: 10, completedSessions: 4 }),
      makeRow({ userId: 2, displayName: "B", avgScore: 80, questionsAnswered: 30, completedSessions: 4 }),
      makeRow({ userId: 9, displayName: "C", avgScore: 80, questionsAnswered: 30, completedSessions: 4 }),
    ];
    const result = computeLeaderboard(rows);
    // B and C both have 30 answered (higher) -> ranked before A; between B(2)
    // and C(9), lower userId wins.
    expect(result.entries.map((e) => e.label)).toEqual(["B", "C", "A"]);
  });

  it("uses an anonymized 'Student #<rank>' label when displayName is missing", () => {
    const rows = [
      makeRow({ userId: 1, displayName: "Named", avgScore: 90, completedSessions: 4 }),
      makeRow({ userId: 2, displayName: null, avgScore: 80, completedSessions: 4 }),
      makeRow({ userId: 3, displayName: "   ", avgScore: 70, completedSessions: 4 }),
    ];
    const result = computeLeaderboard(rows);
    expect(result.entries.map((e) => e.label)).toEqual(["Named", "Student #2", "Student #3"]);
  });

  it("never exposes email or userId in the entries/me output shape", () => {
    const rows = [
      makeRow({ userId: 42, displayName: "Ada", avgScore: 90, completedSessions: 4 }),
    ];
    const result = computeLeaderboard(rows, { viewerUserId: 42 });
    const serialized = JSON.stringify(result);
    // No email-like substring anywhere in the payload.
    expect(serialized).not.toMatch(/@/);
    // No userId / email keys on any entry or on me.
    for (const entry of result.entries) {
      expect(Object.keys(entry).sort()).toEqual(
        ["avgScore", "completedSessions", "label", "questionsAnswered", "rank"].sort(),
      );
    }
    expect(result.me).not.toBeNull();
    expect(Object.keys(result.me!)).not.toContain("userId");
    expect(Object.keys(result.me!)).not.toContain("email");
  });

  it("returns me for an unranked, opted-out, below-threshold viewer", () => {
    const rows = [
      makeRow({ userId: 1, displayName: "Other", avgScore: 90, completedSessions: 5 }),
      makeRow({
        userId: 7,
        displayName: null,
        showOnLeaderboard: false,
        avgScore: 55,
        completedSessions: LEADERBOARD_MIN_SESSIONS - 1,
        questionsAnswered: 4,
      }),
    ];
    const result = computeLeaderboard(rows, { viewerUserId: 7 });
    expect(result.entries.map((e) => e.label)).toEqual(["Other"]);
    expect(result.me).toEqual({
      rank: null,
      label: "You",
      avgScore: 55,
      completedSessions: LEADERBOARD_MIN_SESSIONS - 1,
      questionsAnswered: 4,
      ranked: false,
      optedIn: false,
      belowThreshold: true,
    });
  });

  it("returns me for a ranked viewer with their true rank", () => {
    const rows = [
      makeRow({ userId: 1, displayName: "Top", avgScore: 90, completedSessions: 5 }),
      makeRow({ userId: 2, displayName: "Me", avgScore: 70, completedSessions: 5, questionsAnswered: 12 }),
    ];
    const result = computeLeaderboard(rows, { viewerUserId: 2 });
    expect(result.me).toMatchObject({
      rank: 2,
      label: "Me",
      ranked: true,
      optedIn: true,
      belowThreshold: false,
    });
  });

  it("caps entries to the limit but still returns a viewer outside the cap in me with their true rank", () => {
    const rows: LeaderboardUserRow[] = [];
    // Build LIMIT + 1 eligible users with strictly descending avgScore so ranks
    // are deterministic. The viewer is the lowest-scoring one, ranked last,
    // just outside the cap.
    const total = LEADERBOARD_LIMIT + 1;
    for (let i = 0; i < total; i++) {
      rows.push(
        makeRow({
          userId: i + 1,
          displayName: `User ${i + 1}`,
          avgScore: 100 - i, // descending
          completedSessions: 5,
        }),
      );
    }
    const viewerId = total; // last user, lowest score
    const result = computeLeaderboard(rows, { viewerUserId: viewerId });
    // entries capped to LIMIT.
    expect(result.entries.length).toBe(LEADERBOARD_LIMIT);
    // The viewer is not in the displayed entries...
    expect(result.entries.some((e) => e.rank === total)).toBe(false);
    // ...but me reports their true rank (last) and ranked: true.
    expect(result.me).toMatchObject({ rank: total, ranked: true, optedIn: true });
  });

  it("returns me: null when no viewerUserId is provided", () => {
    const rows = [makeRow({ userId: 1, displayName: "Ada", avgScore: 90, completedSessions: 5 })];
    expect(computeLeaderboard(rows).me).toBeNull();
  });

  it("returns me: null when the viewer has no row", () => {
    const rows = [makeRow({ userId: 1, displayName: "Ada", avgScore: 90, completedSessions: 5 })];
    expect(computeLeaderboard(rows, { viewerUserId: 999 }).me).toBeNull();
  });
});
