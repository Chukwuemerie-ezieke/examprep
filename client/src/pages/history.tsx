import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Trophy, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import type { QuizSession, ExamBody, Subject } from "@/lib/types";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

export default function History() {
  const { data: sessions, isLoading } = useQuery<QuizSession[]>({ queryKey: ["/api/quiz-sessions"] });
  const { data: examBodies } = useQuery<ExamBody[]>({ queryKey: ["/api/exam-bodies"] });
  const { data: subjects } = useQuery<Subject[]>({ queryKey: ["/api/subjects"] });

  const getExamName = (id: number) => examBodies?.find((e) => e.id === id)?.name || "";
  const getSubjectName = (id: number) => subjects?.find((s) => s.id === id)?.name || "";

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const completedSessions = sessions?.filter((s) => s.status === "completed") || [];

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Quiz History" maxWidth="max-w-3xl" />

      <div className="max-w-3xl mx-auto px-4 py-6">
        {completedSessions.length === 0 ? (
          <div className="text-center py-16">
            <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">No completed quizzes yet</p>
            <Link href="/cbt">
              <Button size="sm" data-testid="button-take-quiz">Take a Quiz</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {completedSessions.reverse().map((session) => {
              const percentage = Math.round((session.correctAnswers / session.totalQuestions) * 100);
              const passed = percentage >= 50;

              return (
                <Card key={session.id} className="border border-border" data-testid={`card-session-${session.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{getExamName(session.examBodyId)}</Badge>
                        <Badge variant="outline" className="text-[10px]">{getSubjectName(session.subjectId)}</Badge>
                        {session.year && <Badge variant="outline" className="text-[10px]">{session.year}</Badge>}
                      </div>
                      <Badge className={`text-[10px] ${passed ? "bg-green-600" : "bg-red-600"} text-white`}>
                        {percentage}%
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Trophy className="w-3 h-3" />
                        {session.correctAnswers}/{session.totalQuestions} correct
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(session.timeSpentSeconds)}
                      </span>
                      <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <footer className="border-t border-border py-6 text-center mt-8">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}
