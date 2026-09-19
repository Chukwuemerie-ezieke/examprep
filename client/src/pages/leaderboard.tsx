import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { useAuth } from "@/hooks/use-auth";
import type { ExamBody, Subject, LeaderboardResponse } from "@/lib/types";

// Mirrors server LEADERBOARD_MIN_SESSIONS (server/leaderboard.ts): a user needs
// at least this many completed quizzes before they are ranked in `entries`.
const LEADERBOARD_MIN_SESSIONS = 3;

// Sentinel value for the "Global" (unfiltered) Select option. shadcn/radix
// Select items cannot use an empty-string value, so we use "all".
const ALL = "all";

export default function Leaderboard() {
  const { user, updateProfileMutation } = useAuth();

  const [examBodyId, setExamBodyId] = useState<string>(ALL);
  const [subjectId, setSubjectId] = useState<string>(ALL);
  const [nameDraft, setNameDraft] = useState<string>("");

  const { data: examBodies } = useQuery<ExamBody[]>({ queryKey: ["/api/exam-bodies"] });
  const { data: subjects } = useQuery<Subject[]>({ queryKey: ["/api/subjects"] });

  // Build the query URL with only the chosen filters appended. The leaderboard
  // read is optional-auth: it returns 200 for anonymous callers (with me:null),
  // so the default queryFn is fine. The queryKey includes the active filters so
  // changing a filter re-queries.
  const leaderboardUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (examBodyId !== ALL) params.set("examBodyId", examBodyId);
    if (subjectId !== ALL) params.set("subjectId", subjectId);
    const qs = params.toString();
    return qs ? `/api/leaderboard?${qs}` : "/api/leaderboard";
  }, [examBodyId, subjectId]);

  const { data: leaderboard, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["/api/leaderboard", examBodyId, subjectId],
    queryFn: async () => {
      const res = await fetch(leaderboardUrl, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return (await res.json()) as LeaderboardResponse;
    },
  });

  const entries = leaderboard?.entries ?? [];
  const me = leaderboard?.me ?? null;

  const optedIn = !!user?.showOnLeaderboard;
  const hasDisplayName = !!user?.displayName && user.displayName.trim().length > 0;
  const isPending = updateProfileMutation.isPending;

  const leaderboardHeader = (
    <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-leaderboard-min">
      <Trophy className="w-3 h-3" /> Top players
    </span>
  );

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Leaderboard" maxWidth="max-w-5xl" action={leaderboardHeader} />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Exam body</Label>
            <Select value={examBodyId} onValueChange={setExamBodyId}>
              <SelectTrigger className="w-44" data-testid="select-leaderboard-exam-body">
                <SelectValue placeholder="Global" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} data-testid="option-exam-body-all">Global (all exams)</SelectItem>
                {examBodies?.map((body) => (
                  <SelectItem key={body.id} value={String(body.id)}>
                    {body.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Subject</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger className="w-44" data-testid="select-leaderboard-subject">
                <SelectValue placeholder="Global" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} data-testid="option-subject-all">Global (all subjects)</SelectItem>
                {subjects?.map((subject) => (
                  <SelectItem key={subject.id} value={String(subject.id)}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Self standing (logged-in only) */}
        {user && me && (
          <Card className="border border-primary/40 bg-primary/5" data-testid="card-leaderboard-me">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-primary" />
                  {me.ranked ? (
                    <span className="text-sm font-medium text-foreground" data-testid="text-me-rank">
                      You: rank {me.rank} (avg {me.avgScore}%)
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground" data-testid="text-me-unranked">
                      You are not ranked yet
                    </span>
                  )}
                </div>
                {!me.ranked && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-me-nudge">
                    <Info className="w-3 h-3" />
                    {!me.optedIn
                      ? "Opt in to appear on the leaderboard"
                      : me.belowThreshold
                        ? `Complete ${LEADERBOARD_MIN_SESSIONS} quizzes to get ranked`
                        : "Keep playing to climb the ranks"}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ranked table */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-16" data-testid="text-leaderboard-loading">
            Loading...
          </p>
        ) : entries.length === 0 ? (
          <div className="text-center py-16" data-testid="empty-leaderboard">
            <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No one has qualified for the leaderboard yet</p>
          </div>
        ) : (
          <Card className="border border-border" data-testid="card-leaderboard-table">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">Avg Score</TableHead>
                    <TableHead className="text-right">Quizzes</TableHead>
                    <TableHead className="text-right">Questions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const isMe = me?.ranked && me.rank === entry.rank;
                    return (
                      <TableRow
                        key={entry.rank}
                        data-state={isMe ? "selected" : undefined}
                        data-testid={`row-leaderboard-${entry.rank}`}
                      >
                        <TableCell className="font-medium">{entry.rank}</TableCell>
                        <TableCell className="flex items-center gap-2">
                          {entry.label}
                          {isMe && (
                            <Badge variant="secondary" className="text-[10px]">You</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{entry.avgScore}%</TableCell>
                        <TableCell className="text-right">{entry.completedSessions}</TableCell>
                        <TableCell className="text-right">{entry.questionsAnswered}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Opt-in + display name settings (logged-in only) */}
        {user && (
          <Card className="border border-border" data-testid="card-leaderboard-settings">
            <CardContent className="p-4 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Leaderboard settings</h2>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="switch-opt-in" className="text-sm text-foreground">
                    Show me on the leaderboard
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Opt in to appear in the public rankings once you have completed{" "}
                    {LEADERBOARD_MIN_SESSIONS} quizzes.
                  </p>
                </div>
                <Switch
                  id="switch-opt-in"
                  checked={optedIn}
                  disabled={isPending}
                  onCheckedChange={() =>
                    updateProfileMutation.mutate({ showOnLeaderboard: !optedIn })
                  }
                  data-testid="switch-leaderboard-opt-in"
                />
              </div>

              {/* Nudge: opted in but no display name -> anonymized as Student #N. */}
              {optedIn && !hasDisplayName && (
                <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-name-nudge">
                  <Info className="w-3 h-3" />
                  Set a display name so you are not shown as an anonymous "Student #N".
                </p>
              )}

              <div className="flex flex-col gap-1">
                <Label htmlFor="input-display-name" className="text-xs text-muted-foreground">
                  Display name
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="input-display-name"
                    className="max-w-xs"
                    placeholder={user.displayName || "Your display name"}
                    value={nameDraft}
                    maxLength={100}
                    disabled={isPending}
                    onChange={(e) => setNameDraft(e.target.value)}
                    data-testid="input-leaderboard-display-name"
                  />
                  <Button
                    size="sm"
                    disabled={isPending || nameDraft.trim().length === 0}
                    onClick={() => {
                      updateProfileMutation.mutate(
                        { displayName: nameDraft.trim() },
                        { onSuccess: () => setNameDraft("") },
                      );
                    }}
                    data-testid="button-save-display-name"
                  >
                    Save
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <footer className="border-t border-border py-6 text-center mt-8">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}
