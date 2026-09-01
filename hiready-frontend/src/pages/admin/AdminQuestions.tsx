import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Upload, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { adminAPI, type AdminQuestion } from "@/lib/adminApi";

const CATEGORIES = ["logical", "quantitative", "verbal"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const EMPTY_FORM = {
  Question: "",
  "Option A": "",
  "Option B": "",
  "Option C": "",
  "Option D": "",
  Answer: "A" as AdminQuestion["Answer"],
  category: "logical",
  difficulty: "medium",
  Explanation: "",
};

type QuestionForm = typeof EMPTY_FORM;

const AdminQuestions = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<QuestionForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<AdminQuestion | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [dryRun, setDryRun] = useState(false);

  const questionsQuery = useQuery({
    queryKey: ["admin-questions", page, search, category, difficulty],
    queryFn: () => adminAPI.getQuestions({ page, limit: 10, search, category, difficulty }),
    placeholderData: (prev) => prev,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-questions"] });

  const saveMutation = useMutation({
    mutationFn: (payload: QuestionForm) =>
      editId ? adminAPI.updateQuestion(editId, payload) : adminAPI.createQuestion(payload),
    onSuccess: () => {
      toast.success(editId ? "Question updated" : "Question created");
      setFormOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminAPI.deleteQuestion(id),
    onSuccess: () => {
      toast.success("Question deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkMutation = useMutation({
    mutationFn: () => adminAPI.bulkImportQuestions({ csv: bulkText, dryRun }),
    onSuccess: (res) => {
      if (res.imported > 0) {
        toast.success(`Imported ${res.imported} question(s)`);
        if (res.failed > 0) {
          toast.warning(
            `${res.failed} row(s) failed: ${res.errors.map((e) => `row ${e.row}`).join(", ")}`
          );
        }
        setBulkOpen(false);
        setBulkText("");
        invalidate();
      } else {
        toast.error(res.errors[0]?.error || "Nothing imported — check your CSV format");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (q: AdminQuestion) => {
    setEditId(q._id);
    setForm({
      Question: q.Question,
      "Option A": String(q["Option A"]),
      "Option B": String(q["Option B"]),
      "Option C": String(q["Option C"]),
      "Option D": String(q["Option D"]),
      Answer: q.Answer,
      category: q.category,
      difficulty: q.difficulty || "medium",
      Explanation: (q as { Explanation?: string }).Explanation ?? "",
    });
    setFormOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const data = questionsQuery.data;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Question Bank</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data ? `${data.total} questions` : "Loading…"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
            <Upload className="w-4 h-4 mr-1.5" /> Bulk Import
          </Button>
          <Button size="sm" className="bg-gradient-primary hover:opacity-90" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Question
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
          className="relative"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search question text…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 w-56"
          />
        </form>
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={difficulty} onValueChange={(v) => { setDifficulty(v); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All difficulty</SelectItem>
            {DIFFICULTIES.map((d) => (
              <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="border border-border overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[280px]">Question</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Answer</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questionsQuery.isLoading &&
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(5)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}

              {!questionsQuery.isLoading && data?.questions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    No questions found
                  </TableCell>
                </TableRow>
              )}

              {data?.questions.map((q: typeof data.questions[0]) => (
                <TableRow key={q._id}>
                  <TableCell className="max-w-md">
                    <span className="line-clamp-2 text-sm">{q.Question}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                      A: {String(q["Option A"]).slice(0, 30)} · B: {String(q["Option B"]).slice(0, 30)}
                    </span>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{q.category}</Badge></TableCell>
                  <TableCell>
                    {q.difficulty ? (
                      <Badge variant="outline" className="capitalize">{q.difficulty}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell><Badge>{q.Answer}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(q)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(q)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {data.page} of {data.pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || questionsQuery.isFetching}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.pages || questionsQuery.isFetching}
              onClick={() => setPage((p) => Math.min(p + 1, data.pages))}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Question" : "Add Question"}</DialogTitle>
            <DialogDescription>
              Questions are served to candidates via the aptitude quiz API.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="q-text">Question *</Label>
              <Textarea
                id="q-text"
                required
                rows={3}
                value={form.Question}
                onChange={(e) => setForm({ ...form, Question: e.target.value })}
              />
            </div>
            {(["A", "B", "C", "D"] as const).map((key) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`opt-${key}`}>Option {key} *</Label>
                <Input
                  id={`opt-${key}`}
                  required
                  value={form[`Option ${key}`]}
                  onChange={(e) => setForm({ ...form, [`Option ${key}`]: e.target.value })}
                />
              </div>
            ))}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Correct Answer *</Label>
                <Select
                  value={form.Answer}
                  onValueChange={(v) => setForm({ ...form, Answer: v as AdminQuestion["Answer"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["A", "B", "C", "D"] as const).map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Difficulty</Label>
                <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-explanation">
                Explanation <span className="text-muted-foreground text-xs">(shown after answering & in the notebook)</span>
              </Label>
              <textarea
                id="q-explanation"
                value={form.Explanation}
                onChange={(e) => setForm({ ...form, Explanation: e.target.value.slice(0, 2000) })}
                rows={3}
                placeholder="Step-by-step solution or reasoning…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-primary hover:opacity-90" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : editId ? "Save Changes" : "Create Question"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk import dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Bulk Import Questions</DialogTitle>
            <DialogDescription>
              Paste CSV with header:
              <code className="block mt-2 p-2 rounded bg-muted text-[11px] leading-relaxed break-all">
                Question,"Option A","Option B","Option C","Option D",Answer,category,difficulty,Explanation
              </code>
              Answer must be A/B/C/D · category: logical/quantitative/verbal · difficulty: easy/medium/hard · Explanation optional.
              Max 500 rows per import.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={10}
            placeholder={`Question,"Option A","Option B","Option C","Option D",Answer,category,difficulty\nWhat is 2+2?,3,4,5,6,B,quantitative,easy`}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
<div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="dry-run"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="w-4 h-4 accent-[hsl(var(--primary))]"
              />
              <label htmlFor="dry-run" className="text-sm text-muted-foreground">
                Dry run (validate only, no insert)
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
              <Button
                className="bg-gradient-primary hover:opacity-90"
                disabled={bulkMutation.isPending || !bulkText.trim()}
              onClick={() => bulkMutation.mutate()}
            >
              {bulkMutation.isPending ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.Question.slice(0, 120)}"
              will be permanently removed from the bank. Existing recorded results are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminQuestions;
