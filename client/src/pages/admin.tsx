import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Logo } from "@/components/Logo";
import type { ExamBody, Subject, Topic, Question, StudyTip } from "@/lib/types";
import { ArrowLeft, Lock, Plus, Trash2, Pencil, Upload, X, Save } from "lucide-react";

const PASS_KEY = "examprep_admin_pass";

function authHeaders(pass: string) {
  return { "x-admin-password": pass };
}

// ============ LOGIN ============
function Login({ onLogin }: { onLogin: (pass: string) => void }) {
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pass }),
      });
      if (res.ok) {
        localStorage.setItem(PASS_KEY, pass);
        onLogin(pass);
        toast({ title: "Welcome back, admin" });
      } else {
        toast({ title: "Wrong password", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <Logo size={56} />
          </div>
          <CardTitle className="text-base flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" /> Admin Login
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="pwd" className="text-xs">Password</Label>
              <Input
                id="pwd"
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoFocus
                data-testid="input-admin-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !pass}>
              {loading ? "Verifying..." : "Sign in"}
            </Button>
            <Link href="/">
              <Button type="button" variant="ghost" className="w-full text-xs">
                <ArrowLeft className="w-3 h-3 mr-1" /> Back to site
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ QUESTION FORM ============
const EMPTY_Q = {
  examBodyId: 1, subjectId: 1, topicId: null as number | null,
  year: new Date().getFullYear(),
  questionText: "", optionA: "", optionB: "", optionC: "", optionD: "", optionE: "",
  correctAnswer: "A", explanation: "", difficulty: "medium",
  textbookRef: "",
};

function QuestionForm({
  pass, initial, onClose, examBodies, subjects,
}: {
  pass: string;
  initial?: Question;
  onClose: () => void;
  examBodies: ExamBody[];
  subjects: Subject[];
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<any>(initial ? {
    ...initial,
    optionE: initial.optionE || "",
    textbookRef: initial.textbookRef || "",
  } : EMPTY_Q);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.optionE) delete payload.optionE;
      if (!payload.topicId) payload.topicId = null;
      const url = initial
        ? `/api/admin/questions/${initial.id}`
        : `/api/admin/questions`;
      const method = initial ? "PATCH" : "POST";
      await apiRequest(method, url, payload, authHeaders(pass));
      toast({ title: initial ? "Updated" : "Question created" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/questions-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      onClose();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm">
          {initial ? `Edit Question #${initial.id}` : "New Question"}
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Exam Body</Label>
            <Select value={String(form.examBodyId)} onValueChange={(v) => setForm({ ...form, examBodyId: parseInt(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {examBodies.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Subject</Label>
            <Select value={String(form.subjectId)} onValueChange={(v) => setForm({ ...form, subjectId: parseInt(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Year</Label>
            <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <Label className="text-xs">Difficulty</Label>
            <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs">Question Text</Label>
          <Textarea rows={2} value={form.questionText} onChange={(e) => setForm({ ...form, questionText: e.target.value })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {["A", "B", "C", "D"].map((letter) => (
            <div key={letter}>
              <Label className="text-xs">Option {letter}</Label>
              <Input
                value={form[`option${letter}`]}
                onChange={(e) => setForm({ ...form, [`option${letter}`]: e.target.value })}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Label className="text-xs">Option E (optional, WAEC)</Label>
            <Input value={form.optionE} onChange={(e) => setForm({ ...form, optionE: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Correct Answer</Label>
            <Select value={form.correctAnswer} onValueChange={(v) => setForm({ ...form, correctAnswer: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["A", "B", "C", "D", "E"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Textbook Reference (optional)</Label>
            <Input value={form.textbookRef} onChange={(e) => setForm({ ...form, textbookRef: e.target.value })} placeholder="e.g. New School Maths, ch. 3" />
          </div>
        </div>

        <div>
          <Label className="text-xs">Explanation</Label>
          <Textarea rows={3} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ QUESTIONS TAB ============
function QuestionsTab({ pass, examBodies, subjects }: { pass: string; examBodies: ExamBody[]; subjects: Subject[] }) {
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [filterExam, setFilterExam] = useState<string>("all");
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ questions: Question[]; total: number }>({
    queryKey: ["/api/admin/questions-list", filterExam, filterSubject],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterExam !== "all") params.set("examBodyId", filterExam);
      if (filterSubject !== "all") params.set("subjectId", filterSubject);
      params.set("limit", "100");
      const res = await fetch(`/api/questions?${params.toString()}`);
      return res.json();
    },
  });

  async function del(id: number) {
    if (!confirm(`Delete question #${id}? This cannot be undone.`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/questions/${id}`, undefined, authHeaders(pass));
      toast({ title: "Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/questions-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  }

  if (editing) {
    return (
      <QuestionForm
        pass={pass}
        initial={editing === "new" ? undefined : editing}
        onClose={() => setEditing(null)}
        examBodies={examBodies}
        subjects={subjects}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <Label className="text-xs">Exam</Label>
          <Select value={filterExam} onValueChange={setFilterExam}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {examBodies.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Subject</Label>
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setEditing("new")} className="gap-2">
            <Plus className="w-4 h-4" /> New Question
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Showing {data?.questions.length || 0} of {data?.total || 0}</p>
          {data?.questions.map((q) => {
            const exam = examBodies.find((b) => b.id === q.examBodyId);
            const subj = subjects.find((s) => s.id === q.subjectId);
            return (
              <Card key={q.id} className="border">
                <CardContent className="p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <Badge variant="outline" className="text-[10px]">#{q.id}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{exam?.name}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{subj?.name}</Badge>
                      <Badge variant="outline" className="text-[10px]">{q.year}</Badge>
                      <Badge variant="outline" className="text-[10px]">Ans: {q.correctAnswer}</Badge>
                    </div>
                    <p className="text-sm text-foreground line-clamp-2">{q.questionText}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(q)} data-testid={`btn-edit-${q.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => del(q.id)} data-testid={`btn-delete-${q.id}`}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ STUDY TIPS TAB ============
function TipsTab({ pass, subjects }: { pass: string; subjects: Subject[] }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ subjectId: 1, topicId: null as number | null, title: "", content: "" });
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: tips, isLoading } = useQuery<StudyTip[]>({
    queryKey: ["/api/admin/study-tips"],
    queryFn: async () => {
      const res = await fetch("/api/admin/study-tips", { headers: authHeaders(pass) });
      return res.json();
    },
  });

  function reset() {
    setForm({ subjectId: 1, topicId: null, title: "", content: "" });
    setEditingId(null);
  }

  async function save() {
    try {
      const payload = { ...form };
      if (!payload.topicId) payload.topicId = null;
      if (editingId) {
        await apiRequest("PATCH", `/api/admin/study-tips/${editingId}`, payload, authHeaders(pass));
        toast({ title: "Tip updated" });
      } else {
        await apiRequest("POST", `/api/admin/study-tips`, payload, authHeaders(pass));
        toast({ title: "Tip created" });
      }
      reset();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/study-tips"] });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
  }

  async function del(id: number) {
    if (!confirm("Delete this study tip?")) return;
    try {
      await apiRequest("DELETE", `/api/admin/study-tips/${id}`, undefined, authHeaders(pass));
      toast({ title: "Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/study-tips"] });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  }

  function startEdit(t: StudyTip) {
    setForm({ subjectId: t.subjectId, topicId: t.topicId, title: t.title, content: t.content });
    setEditingId(t.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{editingId ? `Edit Tip #${editingId}` : "New Study Tip"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Subject</Label>
              <Select value={String(form.subjectId)} onValueChange={(v) => setForm({ ...form, subjectId: parseInt(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Content</Label>
            <Textarea rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            {editingId && <Button variant="outline" onClick={reset}>Cancel</Button>}
            <Button onClick={save} disabled={!form.title || !form.content} className="gap-2">
              <Save className="w-4 h-4" /> {editingId ? "Update" : "Add Tip"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-2">Existing Tips ({tips?.length || 0})</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-2">
            {tips?.map((t) => {
              const subj = subjects.find((s) => s.id === t.subjectId);
              return (
                <Card key={t.id}>
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge variant="outline" className="text-[10px]">#{t.id}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{subj?.name}</Badge>
                      </div>
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{t.content}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(t)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => del(t.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ SUBJECTS TAB ============
function SubjectsTab({ pass, subjects }: { pass: string; subjects: Subject[] }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("book-open");

  async function add() {
    try {
      await apiRequest("POST", `/api/admin/subjects`, { name, icon }, authHeaders(pass));
      toast({ title: "Subject added" });
      setName("");
      queryClient.invalidateQueries({ queryKey: ["/api/subjects"] });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Add Subject</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Biology" />
            </div>
            <div>
              <Label className="text-xs">Icon (lucide name)</Label>
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="book-open">book-open</SelectItem>
                  <SelectItem value="calculator">calculator</SelectItem>
                  <SelectItem value="atom">atom</SelectItem>
                  <SelectItem value="flask-conical">flask-conical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={add} disabled={!name} className="gap-2"><Plus className="w-4 h-4" /> Add</Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-2">Current Subjects</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {subjects.map((s) => (
            <Card key={s.id}><CardContent className="p-3 text-sm">
              <Badge variant="outline" className="text-[10px] mr-1">#{s.id}</Badge>
              {s.name}
            </CardContent></Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ BULK IMPORT TAB ============
function BulkTab({ pass }: { pass: string }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; total: number; errors: string[] } | null>(null);

  const sample = `[
  {
    "examBodyId": 1,
    "subjectId": 1,
    "year": 2024,
    "questionText": "What is 2 + 2?",
    "optionA": "3",
    "optionB": "4",
    "optionC": "5",
    "optionD": "6",
    "correctAnswer": "B",
    "explanation": "Basic arithmetic: 2 + 2 = 4.",
    "difficulty": "easy"
  }
]`;

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const items = JSON.parse(text);
      if (!Array.isArray(items)) throw new Error("JSON must be an array");
      const res = await apiRequest("POST", "/api/admin/questions/bulk", items, authHeaders(pass));
      const json = await res.json();
      setResult(json);
      toast({ title: `Imported ${json.created} of ${json.total}` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/questions-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Upload className="w-4 h-4" /> Bulk Import (JSON)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Paste an array of question objects. Required fields: examBodyId (1=WAEC, 2=NECO, 3=JAMB), subjectId, year, questionText, optionA-D, correctAnswer, explanation, difficulty.
        </p>
        <Textarea
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={sample}
          className="font-mono text-xs"
        />
        <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={() => setText(sample)} className="text-xs">Load sample</Button>
          <Button onClick={run} disabled={busy || !text} className="gap-2">
            <Upload className="w-4 h-4" /> {busy ? "Importing..." : "Import"}
          </Button>
        </div>
        {result && (
          <div className="bg-muted p-3 rounded text-xs space-y-1">
            <p className="font-medium">Created {result.created} of {result.total}</p>
            {result.errors.length > 0 && (
              <details>
                <summary className="cursor-pointer text-destructive">{result.errors.length} errors</summary>
                <pre className="mt-2 whitespace-pre-wrap">{result.errors.join("\n")}</pre>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ MAIN ADMIN PAGE ============
export default function Admin() {
  const [pass, setPass] = useState<string | null>(() => localStorage.getItem(PASS_KEY));
  const [verified, setVerified] = useState(false);

  // Re-verify saved password on load
  useEffect(() => {
    if (!pass) return;
    fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pass }),
    }).then((r) => {
      if (r.ok) setVerified(true);
      else {
        localStorage.removeItem(PASS_KEY);
        setPass(null);
      }
    });
  }, [pass]);

  const { data: examBodies } = useQuery<ExamBody[]>({ queryKey: ["/api/exam-bodies"], enabled: verified });
  const { data: subjects } = useQuery<Subject[]>({ queryKey: ["/api/subjects"], enabled: verified });

  if (!pass || !verified) {
    return <Login onLogin={(p) => { setPass(p); setVerified(true); }} />;
  }

  function logout() {
    localStorage.removeItem(PASS_KEY);
    setPass(null);
    setVerified(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <h1 className="text-sm font-bold">Admin Panel</h1>
              <p className="text-[10px] text-muted-foreground">Harmony Digital Consults</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-1">
                <ArrowLeft className="w-3 h-3" /> Site
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={logout}>Logout</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Tabs defaultValue="questions">
          <TabsList className="mb-4">
            <TabsTrigger value="questions">Questions</TabsTrigger>
            <TabsTrigger value="tips">Study Tips</TabsTrigger>
            <TabsTrigger value="subjects">Subjects</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
          </TabsList>
          <TabsContent value="questions">
            {examBodies && subjects && (
              <QuestionsTab pass={pass} examBodies={examBodies} subjects={subjects} />
            )}
          </TabsContent>
          <TabsContent value="tips">
            {subjects && <TipsTab pass={pass} subjects={subjects} />}
          </TabsContent>
          <TabsContent value="subjects">
            {subjects && <SubjectsTab pass={pass} subjects={subjects} />}
          </TabsContent>
          <TabsContent value="bulk">
            <BulkTab pass={pass} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
