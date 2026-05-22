import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, BookOpen, Eye, EyeOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { ExamBody, Subject, Topic, Question } from "@/lib/types";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { PageHeader } from "@/components/PageHeader";

export default function Practice() {
  const [examBodyId, setExamBodyId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [year, setYear] = useState("");
  const [topicId, setTopicId] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [showAnswers, setShowAnswers] = useState<Record<number, boolean>>({});
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const pageSize = 10;

  const { data: examBodies } = useQuery<ExamBody[]>({ queryKey: ["/api/exam-bodies"] });
  const { data: subjects } = useQuery<Subject[]>({ queryKey: ["/api/subjects"] });
  const { data: topics } = useQuery<Topic[]>({
    queryKey: ["/api/subjects", subjectId, "topics"],
    enabled: !!subjectId,
  });
  const { data: years } = useQuery<number[]>({
    queryKey: ["/api/years", { examBodyId, subjectId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (examBodyId) params.set("examBodyId", examBodyId);
      if (subjectId) params.set("subjectId", subjectId);
      const res = await apiRequest("GET", `/api/years?${params}`);
      return res.json();
    },
  });

  const queryParams = new URLSearchParams();
  if (examBodyId) queryParams.set("examBodyId", examBodyId);
  if (subjectId) queryParams.set("subjectId", subjectId);
  if (year) queryParams.set("year", year);
  if (topicId) queryParams.set("topicId", topicId);
  queryParams.set("limit", pageSize.toString());
  queryParams.set("offset", (currentPage * pageSize).toString());

  const { data: questionsData, isLoading } = useQuery<{ questions: Question[]; total: number }>({
    queryKey: ["/api/questions", examBodyId, subjectId, year, topicId, currentPage],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/questions?${queryParams}`);
      return res.json();
    },
    enabled: !!(examBodyId || subjectId),
  });

  const totalPages = Math.ceil((questionsData?.total || 0) / pageSize);

  useEffect(() => {
    setCurrentPage(0);
    setShowAnswers({});
    setSelectedAnswers({});
  }, [examBodyId, subjectId, year, topicId]);

  const toggleAnswer = (qId: number) => {
    setShowAnswers((prev) => ({ ...prev, [qId]: !prev[qId] }));
  };

  const selectAnswer = (qId: number, answer: string) => {
    if (selectedAnswers[qId]) return; // already answered
    setSelectedAnswers((prev) => ({ ...prev, [qId]: answer }));
    setShowAnswers((prev) => ({ ...prev, [qId]: true }));
  };

  const getExamBodyName = (id: number) => examBodies?.find((e) => e.id === id)?.name || "";
  const getSubjectName = (id: number) => subjects?.find((s) => s.id === id)?.name || "";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <PageHeader title="Study Mode" maxWidth="max-w-5xl" />
      <div className="border-b border-border bg-card/50">
        <div className="max-w-5xl mx-auto px-4 py-4">
          {/* Filters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Select value={examBodyId} onValueChange={setExamBodyId}>
              <SelectTrigger className="h-9 text-sm" data-testid="select-exam-body">
                <SelectValue placeholder="Exam Body" />
              </SelectTrigger>
              <SelectContent>
                {examBodies?.map((e) => (
                  <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger className="h-9 text-sm" data-testid="select-subject">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                {subjects?.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="h-9 text-sm" data-testid="select-year">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {years?.map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={topicId} onValueChange={setTopicId}>
              <SelectTrigger className="h-9 text-sm" data-testid="select-topic">
                <SelectValue placeholder="Topic" />
              </SelectTrigger>
              <SelectContent>
                {topics?.map((t) => (
                  <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {!(examBodyId || subjectId) ? (
          <div className="text-center py-16">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Select an exam body or subject to start practicing</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border border-border">
                <CardContent className="p-5">
                  <Skeleton className="h-4 w-3/4 mb-3" />
                  <Skeleton className="h-3 w-1/2 mb-2" />
                  <Skeleton className="h-3 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground">
                {questionsData?.total?.toLocaleString()} questions found
              </p>
              <Badge variant="secondary" className="text-xs">
                Page {currentPage + 1} of {totalPages || 1}
              </Badge>
            </div>

            <div className="space-y-4">
              {questionsData?.questions?.map((q, idx) => {
                const isAnswered = !!selectedAnswers[q.id];
                const isCorrect = selectedAnswers[q.id] === q.correctAnswer;
                const showExplanation = showAnswers[q.id];

                return (
                  <Card key={q.id} className="border border-border" data-testid={`card-question-${q.id}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{getExamBodyName(q.examBodyId)}</Badge>
                          <Badge variant="outline" className="text-[10px]">{q.year}</Badge>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              q.difficulty === "easy" ? "border-green-300 text-green-700 dark:border-green-700 dark:text-green-400" :
                              q.difficulty === "medium" ? "border-yellow-300 text-yellow-700 dark:border-yellow-700 dark:text-yellow-400" :
                              "border-red-300 text-red-700 dark:border-red-700 dark:text-red-400"
                            }`}
                          >
                            {q.difficulty}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          Q{currentPage * pageSize + idx + 1}
                        </span>
                      </div>

                      <p className="text-sm text-foreground font-medium mb-4 leading-relaxed">
                        {q.questionText}
                      </p>

                      <div className="grid gap-2 mb-4">
                        {[
                          { label: "A", value: q.optionA },
                          { label: "B", value: q.optionB },
                          { label: "C", value: q.optionC },
                          { label: "D", value: q.optionD },
                          ...(q.optionE ? [{ label: "E", value: q.optionE }] : []),
                        ].map((opt) => {
                          const isSelected = selectedAnswers[q.id] === opt.label;
                          const isCorrectOption = q.correctAnswer === opt.label;
                          let optionClass = "border border-border hover:border-primary/30 cursor-pointer";

                          if (isAnswered) {
                            if (isCorrectOption) {
                              optionClass = "border-2 border-green-500 bg-green-50 dark:bg-green-950/30";
                            } else if (isSelected && !isCorrectOption) {
                              optionClass = "border-2 border-red-500 bg-red-50 dark:bg-red-950/30";
                            } else {
                              optionClass = "border border-border opacity-60";
                            }
                          }

                          return (
                            <button
                              key={opt.label}
                              onClick={() => selectAnswer(q.id, opt.label)}
                              disabled={isAnswered}
                              className={`flex items-center gap-3 p-3 rounded-lg transition-all text-left ${optionClass}`}
                              data-testid={`button-option-${q.id}-${opt.label}`}
                            >
                              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                isAnswered && isCorrectOption
                                  ? "bg-green-500 text-white"
                                  : isAnswered && isSelected
                                  ? "bg-red-500 text-white"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                {isAnswered && isCorrectOption ? (
                                  <CheckCircle2 className="w-4 h-4" />
                                ) : isAnswered && isSelected ? (
                                  <XCircle className="w-4 h-4" />
                                ) : (
                                  opt.label
                                )}
                              </span>
                              <span className="text-sm text-foreground">{opt.value}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Reveal / Explanation toggle */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleAnswer(q.id)}
                          className="gap-1.5 text-xs"
                          data-testid={`button-toggle-explanation-${q.id}`}
                        >
                          {showExplanation ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {showExplanation ? "Hide" : "Show"} Explanation
                        </Button>
                      </div>

                      {showExplanation && (
                        <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="text-[10px] bg-green-600 text-white">
                              Answer: {q.correctAnswer}
                            </Badge>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed mb-2">{q.explanation}</p>
                          {q.textbookRef && (
                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                              <BookOpen className="w-3 h-3" />
                              {JSON.parse(q.textbookRef).join(", ")}
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground px-3">
                  {currentPage + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <footer className="border-t border-border py-6 text-center mt-8">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}
