import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen, GraduationCap, Trophy, Clock, Calculator,
  Atom, FlaskConical, ArrowRight, Target, Lightbulb
} from "lucide-react";
import type { Stats, ExamBody, Subject } from "@/lib/types";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

const subjectIcons: Record<string, any> = {
  calculator: Calculator,
  "book-open": BookOpen,
  atom: Atom,
  "flask-conical": FlaskConical,
};

export default function Home() {
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });
  const { data: examBodies } = useQuery<ExamBody[]>({
    queryKey: ["/api/exam-bodies"],
  });
  const { data: subjects } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/30" />
        <div className="relative max-w-5xl mx-auto px-4 py-12 sm:py-16">
          <div className="flex flex-col items-center text-center gap-4">
            <Badge variant="secondary" className="text-xs font-medium px-3 py-1" data-testid="badge-brand">
              Harmony Digital Consults
            </Badge>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-tight max-w-2xl" data-testid="text-hero-title">
              Master WAEC, NECO &amp; JAMB
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl leading-relaxed">
              Thousands of past questions with detailed answers, explanations, and study resources.
              Practice at your own pace or simulate the real exam experience.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <Link href="/practice">
                <Button size="default" className="gap-2" data-testid="button-start-practice">
                  <BookOpen className="w-4 h-4" />
                  Start Practicing
                </Button>
              </Link>
              <Link href="/cbt">
                <Button variant="outline" size="default" className="gap-2" data-testid="button-start-cbt">
                  <Clock className="w-4 h-4" />
                  CBT Simulation
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border border-border">
                <CardContent className="p-4">
                  <Skeleton className="h-6 w-16 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card className="border border-border" data-testid="card-stat-questions">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <span className="text-lg font-bold text-foreground">{stats?.totalQuestions?.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Past Questions</p>
                </CardContent>
              </Card>
              <Card className="border border-border" data-testid="card-stat-exams">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <GraduationCap className="w-4 h-4 text-primary" />
                    <span className="text-lg font-bold text-foreground">{stats?.totalExamBodies}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Exam Bodies</p>
                </CardContent>
              </Card>
              <Card className="border border-border" data-testid="card-stat-subjects">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="w-4 h-4 text-primary" />
                    <span className="text-lg font-bold text-foreground">{stats?.totalSubjects}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Subjects</p>
                </CardContent>
              </Card>
              <Card className="border border-border" data-testid="card-stat-score">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy className="w-4 h-4 text-primary" />
                    <span className="text-lg font-bold text-foreground">{stats?.averageScore || 0}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Avg Score</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </section>

      {/* Exam Bodies */}
      <section className="max-w-5xl mx-auto px-4 pb-8">
        <h2 className="text-base font-semibold text-foreground mb-4">Exam Bodies</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {examBodies?.map((body) => (
            <Link key={body.id} href="/practice">
              <Card className="border border-border hover:border-primary/30 transition-colors cursor-pointer h-full" data-testid={`card-exam-${body.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-foreground">{body.name}</h3>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{body.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Subjects */}
      <section className="max-w-5xl mx-auto px-4 pb-8">
        <h2 className="text-base font-semibold text-foreground mb-4">Subjects</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {subjects?.map((subject) => {
            const IconComp = subjectIcons[subject.icon || ""] || BookOpen;
            return (
              <Link key={subject.id} href="/practice">
                <Card className="border border-border hover:border-primary/30 transition-colors cursor-pointer h-full" data-testid={`card-subject-${subject.id}`}>
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <IconComp className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-sm font-medium text-foreground">{subject.name}</h3>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Quick Actions */}
      <section className="max-w-5xl mx-auto px-4 pb-8">
        <h2 className="text-base font-semibold text-foreground mb-4">Quick Actions</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <Link href="/practice">
            <Card className="border border-border hover:border-primary/30 transition-colors cursor-pointer h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-0.5">Study Mode</h3>
                  <p className="text-xs text-muted-foreground">Browse questions by exam, subject, year, and topic</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/cbt">
            <Card className="border border-border hover:border-primary/30 transition-colors cursor-pointer h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-chart-2/10 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-[hsl(var(--chart-2))]" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-0.5">CBT Mock Exam</h3>
                  <p className="text-xs text-muted-foreground">Timed simulation of the real exam experience</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/study-tips">
            <Card className="border border-border hover:border-primary/30 transition-colors cursor-pointer h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-chart-3/10 flex items-center justify-center shrink-0">
                  <Lightbulb className="w-4 h-4 text-[hsl(var(--chart-3))]" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-0.5">Study Tips</h3>
                  <p className="text-xs text-muted-foreground">Expert strategies and textbook references</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center">
        <p className="text-xs text-muted-foreground mb-2">
          Harmony Digital Consults Ltd &mdash; Empowering students for exam success
        </p>
        <PerplexityAttribution />
      </footer>
    </div>
  );
}
