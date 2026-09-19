// Pure, DB-free leaderboard ranking core. Mirrors the extraction style of
// server/analytics.ts and server/grading.ts: the route fetches already
// aggregated per-user rows from storage and hands plain data to
// computeLeaderboard, so all ranking / threshold / tie-break / limit /
// self-standing logic is unit-testable with in-memory fixtures and no Postgres.
//
// PRIVACY (non-negotiable): the returned entries/me shapes NEVER contain email,
// a raw userId used as an identity/handle, session history, dates, or any raw
// per-session data. Only opted-in users with at least LEADERBOARD_MIN_SESSIONS
// completed sessions ever appear in `entries`. A missing displayName is
// replaced by an anonymized `Student #<rank>` label (never derived from email,
// never leaking the numeric userId). The authenticated viewer's own standing
// (`me`) is computed regardless of opt-in/threshold, but the route returns it
// ONLY to that viewer.

// Minimum completed sessions a user needs before they are eligible to appear on
// the leaderboard `entries`. Below this threshold a user is excluded from the
// public ranking (but may still see their own `me` self-standing).
export const LEADERBOARD_MIN_SESSIONS = 3;

// Cap on how many ranked entries are returned in the public `entries` list. The
// viewer's `me` row is always returned separately, even when their rank falls
// outside this cap.
export const LEADERBOARD_LIMIT = 50;

// One aggregated row per user, produced by storage.getLeaderboardRows over
// COMPLETED sessions (optionally filtered by examBodyId/subjectId). avgScore is
// the unweighted mean of per-session round(correct/total*100) to match the
// analytics convention. This is the single source of truth for the row shape;
// storage imports it from here.
export interface LeaderboardUserRow {
  userId: number;
  displayName: string | null;
  showOnLeaderboard: boolean;
  completedSessions: number;
  avgScore: number;
  questionsAnswered: number;
}

// A public leaderboard entry. Intentionally carries NO email and NO userId: the
// only identity exposed is the human-readable `label`.
export interface LeaderboardEntry {
  rank: number;
  label: string;
  avgScore: number;
  completedSessions: number;
  questionsAnswered: number;
}

// The authenticated viewer's own standing. Returned only to that viewer.
// `rank` is null when the viewer is not in the eligible ranked set. The flags
// let the client explain why: optedIn (they turned the leaderboard on) and
// belowThreshold (they have fewer than the minimum completed sessions).
export interface LeaderboardMeRow {
  rank: number | null;
  label: string;
  avgScore: number;
  completedSessions: number;
  questionsAnswered: number;
  ranked: boolean;
  optedIn: boolean;
  belowThreshold: boolean;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  me: LeaderboardMeRow | null;
}

// Build the anonymized-safe display label. Uses a trimmed displayName when
// present and non-empty, otherwise falls back to `Student #<rank>`. Never
// derives from email and never exposes the numeric userId.
function labelFor(displayName: string | null, rank: number): string {
  const trimmed = displayName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Student #${rank}`;
}

// Deterministic ranking comparator: avgScore desc, then questionsAnswered desc,
// then userId asc as a stable final tie-break so the ordering is fully
// deterministic regardless of input order.
function byRank(a: LeaderboardUserRow, b: LeaderboardUserRow): number {
  return (
    b.avgScore - a.avgScore ||
    b.questionsAnswered - a.questionsAnswered ||
    a.userId - b.userId
  );
}

// Compute the leaderboard result from already-aggregated per-user rows.
//
// - `entries`: opted-in users with >= minSessions completed sessions, ranked
//   and capped to `limit`.
// - `me`: the viewer's standing (when viewerUserId is provided and present in
//   rows), computed against the full eligible ranked set so a viewer outside
//   the top-N cap still learns their true rank. `me` is null when no
//   viewerUserId is given or the viewer has no row.
export function computeLeaderboard(
  rows: LeaderboardUserRow[],
  options: { minSessions?: number; limit?: number; viewerUserId?: number } = {},
): LeaderboardResult {
  const minSessions = options.minSessions ?? LEADERBOARD_MIN_SESSIONS;
  const limit = options.limit ?? LEADERBOARD_LIMIT;
  const { viewerUserId } = options;

  // Eligible set: opted in AND at/above the minimum-sessions threshold.
  const eligible = rows
    .filter((r) => r.showOnLeaderboard === true && r.completedSessions >= minSessions)
    .sort(byRank);

  // Assign 1..N ranks to the full eligible set (before capping), so `me` can
  // report a true rank even when it falls outside the displayed `limit`.
  const rankByUserId = new Map<number, number>();
  eligible.forEach((r, i) => rankByUserId.set(r.userId, i + 1));

  const entries: LeaderboardEntry[] = eligible.slice(0, limit).map((r) => {
    const rank = rankByUserId.get(r.userId)!;
    return {
      rank,
      label: labelFor(r.displayName, rank),
      avgScore: r.avgScore,
      completedSessions: r.completedSessions,
      questionsAnswered: r.questionsAnswered,
    };
  });

  let me: LeaderboardMeRow | null = null;
  if (viewerUserId !== undefined) {
    const viewer = rows.find((r) => r.userId === viewerUserId);
    if (viewer) {
      const rank = rankByUserId.get(viewer.userId) ?? null;
      const ranked = rank !== null;
      me = {
        rank,
        // When ranked, use the true rank for the fallback label; otherwise the
        // viewer is unranked, so any anonymized fallback should not imply a
        // position. Fall back to a neutral label for that case.
        label: ranked ? labelFor(viewer.displayName, rank!) : selfLabel(viewer.displayName),
        avgScore: viewer.avgScore,
        completedSessions: viewer.completedSessions,
        questionsAnswered: viewer.questionsAnswered,
        ranked,
        optedIn: viewer.showOnLeaderboard === true,
        belowThreshold: viewer.completedSessions < minSessions,
      };
    }
  }

  return { entries, me };
}

// Label for an unranked viewer's own self-standing. Uses their display name
// when present; otherwise a neutral anonymized label that does not imply a
// leaderboard position. Never derived from email or userId.
function selfLabel(displayName: string | null): string {
  const trimmed = displayName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "You";
}
