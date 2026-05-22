import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Clock, Play, CheckCircle2, XCircle, Trophy, RotateCcw, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ExamBody, Subject, Question, QuizSession } from "@/lib/types";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

type Phase = "setup" | "quiz" | "results";

export default function CBT() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [examBodyId, setExamBodyId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [year, setYear] = useState("");
  const [questionCount, setQuestionCount] = useState("40");
  const [timeLimit, setTimeLimit] = useState("60");

  // Quiz state
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [result, setResult] = useState<{ correct: number; total: number; time: number } | null>(null);

  const { data: examBodies } = useQuery<ExamBody[]>({ queryKey: ["/api/exam-bodies"] });
  const { data: subjects } = useQuery<Subject[]>({ queryKey: ["/api/subjects"] });
  const { data: years } = useQuery<number[]>({
    queryKey: ["/api/years", { examBodyId, subjectId }],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (examBodyId) p.set("examBodyId", examBodyId);
      if (subjectId) p.set("subjectId", subjectId);
      const res = await apiRequest("GET", `/api/years?${p}`);
      return res.json();
    },
    enabled: !!(examBodyId || subjectId),
  });

  // Timer
  useEffect(() => {
    if (phase !== "quiz" || timeRemaining <= 0) return;
    const timer = setInterval(() => {
      setTimeRemaining((t) => {
        if (t <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, timeRemaining]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const startQuiz = async () => {
    if (!examBodyId || !subjectId) return;

    const p = new URLSearchParams();
    p.set("examBodyId", examBodyId);
    p.set("subjectId", subjectId);
    if (year) p.set("year", year);
    p.set("limit", questionCount);
    const res = await apiRequest("GET", `/api/questions?${p}`);
    const data = await res.json();

    if (!data.questions?.length) return;

    // Shuffle questions
    const shuffled = [...data.questions].sort(() => Math.random() - 0.5).slice(0, parseInt(questionCount));
    setQuestions(shuffled);
    setAnswers({});
    setCurrentIdx(0);
    setTimeRemaining(parseInt(timeLimit) * 60);

    // Create session
    const sessionRes = await apiRequest("POST", "/api/quiz-sessions", {
      examBodyId: parseInt(examBodyId),
      subjectId: parseInt(subjectId),
      year: year ? parseInt(year) : null,
      totalQuestions: shuffled.length,
      answeredQuestions: 0,
      correctAnswers: 0,
      timeLimitMinutes: parseInt(timeLimit),
      timeSpentSeconds: 0,
      status: "in_progress",
      answersJson: "{}",
      createdAt: new Date().toISOString(),
    });
    const session = await sessionRes.json();
    setSessionId(session.id);
    setPhase("quiz");
  };

  const handleSubmit = useCallback(async () => {
    const totalTime = parseInt(timeLimit) * 60 - timeRemaining;
    let correct = 0;
    for (const q of questions) {
      if (answers[q.id] === q.correctAnswer) correct++;
    }

    setResult({ correct, total: questions.length, time: totalTime });

    if (sessionId) {
      await apiRequest("PATCH", `/api/quiz-sessions/${sessionId}`, {
        answeredQuestions: Object.keys(answers).length,
        correctAnswers: correct,
        timeSpentSeconds: totalTime,
        status: "completed",
        answersJson: JSON.stringify(answers),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/quiz-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    }

    setPhase("results");
  }, [answers, questions, timeRemaining, timeLimit, sessionId]);

  const selectAnswer = (qId: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: answer }));
  };

  const currentQ = questions[currentIdx];
  const answeredCount = Object.keys(answers).length;

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="CBT Simulation" maxWidth="max-w-3xl" />

        <div className="max-w-3xl mx-auto px-4 py-8">
          <Card className="border border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Set Up Your Mock Exam</h2>
                  <p className="text-xs text-muted-foreground">Configure your CBT simulation settings</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="text-xs font-medium text-foreground mb-1.5 block">Exam Body</label>
                  <Select value={examBodyId} onValueChange={setExamBodyId}>
                    <SelectTrigger className="h-9 text-sm" data-testid="select-exam-body">
                      <SelectValue placeholder="Select exam body" />
                    </SelectTrigger>
                    <SelectContent>
                      {examBodies?.map((e) => (
                        <SelectItem key={e.id} value={e.id.toString()}>{e.name} - {e.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground mb-1.5 block">Subject</label>
                  <Select value={subjectId} onValueChange={setSubjectId}>
                    <SelectTrigger className="h-9 text-sm" data-testid="select-subject">
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects?.map((s) => (
                        <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground mb-1.5 block">Year (Optional)</label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger className="h-9 text-sm" data-testid="select-year">
                      <SelectValue placeholder="Any year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Year</SelectItem>
                      {years?.map((y) => (
                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-foreground mb-1.5 block">Questions</label>
                    <Select value={questionCount} onValueChange={setQuestionCount}>
                      <SelectTrigger className="h-9 text-sm" data-testid="select-count">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 Questions</SelectItem>
                        <SelectItem value="20">20 Questions</SelectItem>
                        <SelectItem value="40">40 Questions</SelectItem>
                        <SelectItem value="60">60 Questions</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground mb-1.5 block">Time Limit</label>
                    <Select value={timeLimit} onValueChange={setTimeLimit}>
                      <SelectTrigger className="h-9 text-sm" data-testid="select-time">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 Minutes</SelectItem>
                        <SelectItem value="30">30 Minutes</SelectItem>
                        <SelectItem value="45">45 Minutes</SelectItem>
                        <SelectItem value="60">60 Minutes</SelectItem>
                        <SelectItem value="90">90 Minutes</SelectItem>
                        <SelectItem value="120">120 Minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={startQuiz}
                  disabled={!examBodyId || !subjectId}
                  className="w-full mt-2 gap-2"
                  data-testid="button-start-quiz"
                >
                  <Play className="w-4 h-4" />
                  Start Exam
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <footer className="border-t border-border py-6 text-center mt-8">
          <PerplexityAttribution />
        </footer>
      </div>
    );
  }

  if (phase === "results") {
    const percentage = result ? Math.round((result.correct / result.total) * 100) : 0;
    const passed = percentage >= 50;

    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-card/50">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <h1 className="text-base font-semibold text-foreground">Exam Results</h1>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-8">
          <Card className="border border-border mb-6">
            <CardContent className="p-6 text-center">
              <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${passed ? "bg-green-100 dark:bg-green-950/30" : "bg-red-100 dark:bg-red-950/30"}`}>
                <Trophy className={`w-8 h-8 ${passed ? "text-green-600" : "text-red-600"}`} />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-1" data-testid="text-result-score">
                {percentage}%
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {result?.correct} of {result?.total} correct
              </p>
              <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                <span>Time: {formatTime(result?.time || 0)}</span>
                <span>{passed ? "Passed" : "Needs Improvement"}</span>
              </div>
            </CardContent>
          </Card>

          {/* Review answers */}
          <h3 className="text-sm font-semibold text-foreground mb-3">Review Your Answers</h3>
          <div className="space-y-3">
            {questions.map((q, idx) => {
              const userAnswer = answers[q.id];
              const isCorrect = userAnswer === q.correctAnswer;
              return (
                <Card key={q.id} className="border border-border" data-testid={`card-review-${q.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isCorrect ? "bg-green-500" : "bg-red-500"}`}>
                        {isCorrect ? <CheckCircle2 className="w-3.5 h-3.5 text-white" /> : <XCircle className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground font-medium mb-1">Q{idx + 1}. {q.questionText}</p>
                        {!isCorrect && userAnswer && (
                          <p className="text-xs text-red-600 dark:text-red-400 mb-0.5">
                            Your answer: {userAnswer} — {q[`option${userAnswer}` as keyof Question]}
                          </p>
                        )}
                        <p className="text-xs text-green-600 dark:text-green-400 mb-1">
                          Correct: {q.correctAnswer} — {q[`option${q.correctAnswer}` as keyof Question]}
                        </p>
                        <p className="text-xs text-muted-foreground">{q.explanation}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex gap-3 mt-6">
            <Button onClick={() => { setPhase("setup"); setResult(null); }} variant="outline" className="gap-2 flex-1" data-testid="button-new-exam">
              <RotateCcw className="w-4 h-4" /> New Exam
            </Button>
            <Link href="/" className="flex-1">
              <Button variant="default" className="gap-2 w-full" data-testid="button-go-home">
                <ArrowLeft className="w-4 h-4" /> Home
              </Button>
            </Link>
          </div>
        </div>
        <footer className="border-t border-border py-6 text-center mt-8">
          <PerplexityAttribution />
        </footer>
      </div>
    );
  }

  // Quiz phase
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Quiz header */}
      <div className="border-b border-border bg-card/50 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              Question {currentIdx + 1} of {questions.length}
            </span>
            <div className={`flex items-center gap-1.5 text-sm font-mono font-medium ${timeRemaining < 300 ? "text-red-600" : "text-foreground"}`}>
              <Clock className="w-4 h-4" />
              {formatTime(timeRemaining)}
            </div>
          </div>
          <Progress value={(answeredCount / questions.length) * 100} className="h-1.5" />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">{answeredCount} answered</span>
            <span className="text-[10px] text-muted-foreground">{questions.length - answeredCount} remaining</span>
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 max-w-3xl mx-auto px-4 py-6 w-full">
        {currentQ && (
          <div>
            <p className="text-sm text-foreground font-medium mb-5 leading-relaxed" data-testid="text-question">
              {currentQ.questionText}
            </p>

            <div className="grid gap-2 mb-6">
              {[
                { label: "A", value: currentQ.optionA },
                { label: "B", value: currentQ.optionB },
                { label: "C", value: currentQ.optionC },
                { label: "D", value: currentQ.optionD },
                ...(currentQ.optionE ? [{ label: "E", value: currentQ.optionE }] : []),
              ].map((opt) => {
                const isSelected = answers[currentQ.id] === opt.label;
                return (
                  <button
                    key={opt.label}
                    onClick={() => selectAnswer(currentQ.id, opt.label)}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border hover:border-primary/30"
                    }`}
                    data-testid={`button-option-${opt.label}`}
                  >
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {opt.label}
                    </span>
                    <span className="text-sm text-foreground">{opt.value}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="border-t border-border bg-card/50 sticky bottom-0">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex flex-wrap gap-1.5 mb-3 justify-center">
            {questions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => setCurrentIdx(idx)}
                className={`w-7 h-7 rounded text-[10px] font-medium transition-all ${
                  idx === currentIdx
                    ? "bg-primary text-primary-foreground"
                    : answers[q.id]
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid={`button-nav-${idx}`}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              disabled={currentIdx === 0}
              className="flex-1"
              data-testid="button-prev"
            >
              Previous
            </Button>
            {currentIdx < questions.length - 1 ? (
              <Button
                size="sm"
                onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                className="flex-1"
                data-testid="button-next"
              >
                Next
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSubmit}
                className="flex-1 bg-green-600 hover:bg-green-700"
                data-testid="button-submit"
              >
                Submit Exam
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
