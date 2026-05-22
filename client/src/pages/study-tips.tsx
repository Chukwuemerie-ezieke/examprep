import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lightbulb, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { apiRequest } from "@/lib/queryClient";
import type { Subject, StudyTip } from "@/lib/types";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

export default function StudyTips() {
  const [subjectId, setSubjectId] = useState("");

  const { data: subjects } = useQuery<Subject[]>({ queryKey: ["/api/subjects"] });
  const { data: tips, isLoading } = useQuery<StudyTip[]>({
    queryKey: ["/api/study-tips", { subjectId }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/study-tips?subjectId=${subjectId}`);
      return res.json();
    },
    enabled: !!subjectId,
  });

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Study Tips & Resources" maxWidth="max-w-3xl" />
      <div className="border-b border-border bg-card/50">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger className="h-9 text-sm max-w-xs" data-testid="select-subject">
              <SelectValue placeholder="Select a subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects?.map((s) => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {!subjectId ? (
          <div className="text-center py-16">
            <Lightbulb className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Select a subject to view study tips and strategies</p>
          </div>
        ) : isLoading ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">Loading tips...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tips?.map((tip) => (
              <Card key={tip.id} className="border border-border" data-testid={`card-tip-${tip.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-chart-3/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Lightbulb className="w-4 h-4 text-[hsl(var(--chart-3))]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-1.5">{tip.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{tip.content}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {tips?.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No study tips available for this subject yet.</p>
              </div>
            )}

            {/* Recommended textbooks section */}
            <Card className="border border-border mt-6">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Recommended Textbooks</h3>
                </div>
                <div className="space-y-2">
                  {subjectId === "1" && (
                    <>
                      <p className="text-sm text-muted-foreground">New General Mathematics for Senior Secondary Schools 1-3 (M.F. Macrae et al.)</p>
                      <p className="text-sm text-muted-foreground">Further Mathematics Project (M.R. Tuttuh-Adegun et al.)</p>
                      <p className="text-sm text-muted-foreground">Exam Focus Mathematics (WAEC/NECO past questions)</p>
                    </>
                  )}
                  {subjectId === "2" && (
                    <>
                      <p className="text-sm text-muted-foreground">Exam Focus English Language</p>
                      <p className="text-sm text-muted-foreground">English Grammar by P.O. Olatunbosun</p>
                      <p className="text-sm text-muted-foreground">Oral English for Schools and Colleges</p>
                      <p className="text-sm text-muted-foreground">Countdown to English (WAEC/NECO)</p>
                    </>
                  )}
                  {subjectId === "3" && (
                    <>
                      <p className="text-sm text-muted-foreground">New School Physics by M.W. Anyakoha</p>
                      <p className="text-sm text-muted-foreground">Senior Secondary Physics by P.N. Okeke & M.W. Anyakoha</p>
                      <p className="text-sm text-muted-foreground">Comprehensive Certificate Physics (for exercises)</p>
                    </>
                  )}
                  {subjectId === "4" && (
                    <>
                      <p className="text-sm text-muted-foreground">New School Chemistry by Osei Yaw Ababio</p>
                      <p className="text-sm text-muted-foreground">Chemistry for Senior Secondary Schools (A.I. Ilegbusi)</p>
                      <p className="text-sm text-muted-foreground">Exam Focus Chemistry (WAEC/NECO past questions)</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <footer className="border-t border-border py-6 text-center mt-8">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}
