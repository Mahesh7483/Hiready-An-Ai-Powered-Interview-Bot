import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Upload, Search, Code } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { adminAPI, type AdminCodingQuestion } from "@/lib/adminApi";

const DIFFS = ["easy", "medium", "hard"] as const;
const CATS = ["arrays","strings","linked-lists","trees","graphs","dynamic-programming","sorting","searching","greedy","backtracking","bit-manipulation","math","geometry","databases","system-design"] as const;

const EMPTY: Omit<AdminCodingQuestion, "_id"> = {
  title: "", slug: "", description: "Solve the problem.", difficulty: "easy", category: "arrays", tags: [], starterCode: { python: "", javascript: "", typescript: "", java: "", go: "", cpp: "", rust: "" },
  solution: { python: "", javascript: "", typescript: "", java: "", go: "", cpp: "", rust: "" },
  testCases: [{ input: "1\n2", output: "3", isHidden: false, points: 1 }],
  constraints: "", timeLimit: 2000, memoryLimit: 256, explanation: "", isPublished: false, isActive: true,
};

const AdminCodingQuestions = () => {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [published, setPublished] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<AdminCodingQuestion, "_id">>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<AdminCodingQuestion | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [dryRun, setDryRun] = useState(false);

  const q = useQuery({
    queryKey: ["admin-coding", page, search, category, difficulty, published],
    queryFn: () => adminAPI.getCodingQuestions({ page, limit: 10, search, category, difficulty, published }),
    placeholderData: (p) => p,
  });

  const save = useMutation({
    mutationFn: (payload: Omit<AdminCodingQuestion, "_id">) => editId ? adminAPI.updateCodingQuestion(editId, payload) : adminAPI.createCodingQuestion(payload),
    onSuccess: () => { toast.success(editId ? "Updated" : "Created"); setFormOpen(false); qc.invalidateQueries({ queryKey: ["admin-coding"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => adminAPI.deleteCodingQuestion(id),
    onSuccess: () => { toast.success("Deleted"); setDeleteTarget(null); qc.invalidateQueries({ queryKey: ["admin-coding"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const bulk = useMutation({
    mutationFn: () => adminAPI.bulkImportCoding({ csv: bulkText, dryRun }),
    onSuccess: (r) => {
      if (r.imported > 0) {
        toast.success(`Imported ${r.imported}`);
        if (r.failed) toast.warning(`${r.failed} failed: ${r.errors.slice(0,2).map(e=>e.error).join("; ")}`);
        setBulkOpen(false); setBulkText(""); qc.invalidateQueries({ queryKey: ["admin-coding"] });
      } else toast.error(r.errors[0]?.error || "Nothing imported");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditId(null); setForm(EMPTY); setFormOpen(true); };
  const openEdit = (c: AdminCodingQuestion) => {
    setEditId(c._id);
    setForm({
      title: c.title, slug: c.slug, description: c.description, difficulty: c.difficulty, category: c.category, tags: c.tags || [],
      starterCode: { python: c.starterCode?.python||"", javascript: c.starterCode?.javascript||"", typescript: c.starterCode?.typescript||"", java: c.starterCode?.java||"", go: c.starterCode?.go||"", cpp: c.starterCode?.cpp||"", rust: c.starterCode?.rust||"" },
      solution: { python: c.solution?.python||"", javascript: c.solution?.javascript||"", typescript: c.solution?.typescript||"", java: c.solution?.java||"", go: c.solution?.go||"", cpp: c.solution?.cpp||"", rust: c.solution?.rust||"" },
      testCases: c.testCases?.length ? c.testCases : [{ input: "", output: "", isHidden: false, points: 1 }],
      constraints: c.constraints||"", timeLimit: c.timeLimit||2000, memoryLimit: c.memoryLimit||256, explanation: c.explanation||"", isPublished: !!c.isPublished, isActive: c.isActive!==false,
    });
    setFormOpen(true);
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Code className="w-6 h-6 text-primary" /> Coding Questions</h1>
          <p className="text-sm text-muted-foreground mt-1">{q.data ? `${q.data.total} questions` : "Loading…"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={()=> setBulkOpen(true)}><Upload className="w-4 h-4 mr-1.5" /> Bulk Import</Button>
          <Button size="sm" className="bg-gradient-primary hover:opacity-90" onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" /> Add Question</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <form onSubmit={e=>{e.preventDefault(); setPage(1); setSearch(searchInput.trim());}} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search title…" value={searchInput} onChange={e=>setSearchInput(e.target.value)} className="pl-9 w-56" />
        </form>
        <Select value={category} onValueChange={v=>{setCategory(v); setPage(1);}}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{CATS.map(c=> <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={difficulty} onValueChange={v=>{setDifficulty(v); setPage(1);}}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All difficulty</SelectItem>{DIFFS.map(d=> <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}</SelectContent></Select>
        <Select value={published} onValueChange={v=>{setPublished(v); setPage(1);}}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="true">Published</SelectItem><SelectItem value="false">Draft</SelectItem></SelectContent></Select>
      </div>

      <Card className="border border-border overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="min-w-[260px]">Title</TableHead><TableHead>Category</TableHead><TableHead>Difficulty</TableHead><TableHead>Tests</TableHead><TableHead>Published</TableHead><TableHead className="w-24">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.isLoading && [...Array(5)].map((_,i)=> <TableRow key={i}>{[...Array(6)].map((_,j)=> <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)}
              {!q.isLoading && q.data?.questions.length===0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No questions</TableCell></TableRow>}
              {q.data?.questions.map((c)=> (
                <TableRow key={c._id}>
                  <TableCell className="max-w-md"><span className="line-clamp-1 text-sm font-medium">{c.title}</span><span className="text-xs text-muted-foreground truncate block">{c.slug}</span></TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{c.category}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{c.difficulty}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{c.testCases?.length||0}</Badge>{c.isPublished ? "" : <Badge variant="secondary" className="ml-1 text-[10px]">draft</Badge>}</TableCell>
                  <TableCell>{c.isPublished ? <Badge className="bg-success">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                  <TableCell><div className="flex gap-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=> openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={()=> setDeleteTarget(c)}><Trash2 className="w-3.5 h-3.5" /></Button></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {q.data && q.data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {q.data.page} of {q.data.pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page<=1} onClick={()=> setPage(p=>p-1)}><ChevronLeft className="w-4 h-4 mr-1" />Prev</Button>
            <Button variant="outline" size="sm" disabled={page>=q.data.pages} onClick={()=> setPage(p=>p+1)}>Next<ChevronRight className="w-4 h-4 ml-1" /></Button>
          </div>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId?"Edit":"Add"} Coding Question</DialogTitle><DialogDescription>Fields marked * are required. Starter code per language is optional.</DialogDescription></DialogHeader>
          <form onSubmit={e=>{e.preventDefault(); save.mutate(form);}} className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-1.5"><Label>Title *</Label><Input required value={form.title} onChange={e=>setForm({...form, title:e.target.value})} placeholder="Two Sum" /></div>
              <div className="space-y-1.5"><Label>Slug</Label><Input value={form.slug} onChange={e=>setForm({...form, slug:e.target.value})} placeholder="auto from title" /></div>
              <div className="space-y-1.5"><Label>Description *</Label><Textarea required rows={5} value={form.description} onChange={e=>setForm({...form, description:e.target.value})} placeholder="Problem statement... Markdown allowed" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Difficulty *</Label><Select value={form.difficulty} onValueChange={v=> setForm({...form, difficulty: v as typeof form.difficulty})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DIFFS.map(d=> <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Category *</Label><Select value={form.category} onValueChange={v=> setForm({...form, category: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATS.map(c=> <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Tags (comma)</Label><Input value={(form.tags||[]).join(", ")} onChange={e=> setForm({...form, tags: e.target.value.split(",").map(s=>s.trim().toLowerCase()).filter(Boolean)})} placeholder="array, hashmap" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Time Limit (ms)</Label><Input type="number" value={form.timeLimit} onChange={e=> setForm({...form, timeLimit: parseInt(e.target.value,10)||2000})} /></div>
                <div><Label>Memory (MB)</Label><Input type="number" value={form.memoryLimit} onChange={e=> setForm({...form, memoryLimit: parseInt(e.target.value,10)||256})} /></div>
              </div>
              <div className="space-y-1.5"><Label>Constraints</Label><Textarea rows={2} value={form.constraints||""} onChange={e=> setForm({...form, constraints:e.target.value})} placeholder="1 <= n <= 1e5" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Starter Python</Label><Textarea rows={4} className="font-mono text-xs" value={form.starterCode.python} onChange={e=> setForm({...form, starterCode:{...form.starterCode, python:e.target.value}})} /></div>
                <div className="space-y-1.5"><Label>Starter JavaScript</Label><Textarea rows={4} className="font-mono text-xs" value={form.starterCode.javascript} onChange={e=> setForm({...form, starterCode:{...form.starterCode, javascript:e.target.value}})} /></div>
                <div className="space-y-1.5"><Label>Starter Java</Label><Textarea rows={3} className="font-mono text-xs" value={form.starterCode.java} onChange={e=> setForm({...form, starterCode:{...form.starterCode, java:e.target.value}})} /></div>
                <div className="space-y-1.5"><Label>Starter C++</Label><Textarea rows={3} className="font-mono text-xs" value={form.starterCode.cpp} onChange={e=> setForm({...form, starterCode:{...form.starterCode, cpp:e.target.value}})} /></div>
              </div>
              <div className="space-y-1.5"><Label>Explanation</Label><Textarea rows={2} value={form.explanation||""} onChange={e=> setForm({...form, explanation:e.target.value})} /></div>
              <div className="space-y-2">
                <Label>Test Cases (at least 1)</Label>
                {form.testCases.map((tc, idx)=> (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 p-2 border rounded">
                    <div><Label className="text-xs">Input</Label><Textarea rows={2} className="font-mono text-xs" value={tc.input} onChange={e=>{const a=[...form.testCases]; a[idx]={...a[idx], input:e.target.value}; setForm({...form, testCases:a});}} /></div>
                    <div><Label className="text-xs">Output</Label><Textarea rows={2} className="font-mono text-xs" value={tc.output} onChange={e=>{const a=[...form.testCases]; a[idx]={...a[idx], output:e.target.value}; setForm({...form, testCases:a});}} /></div>
                    <div className="flex flex-col gap-2 justify-end">
                      <label className="flex items-center gap-1 text-xs"><Checkbox checked={!!tc.isHidden} onCheckedChange={v=>{const a=[...form.testCases]; a[idx]={...a[idx], isHidden:!!v}; setForm({...form, testCases:a});}} /> Hidden</label>
                      <Input type="number" className="w-16 h-7 text-xs" value={tc.points} onChange={e=>{const a=[...form.testCases]; a[idx]={...a[idx], points: parseInt(e.target.value,10)||1}; setForm({...form, testCases:a});}} />
                      <Button type="button" variant="ghost" size="sm" onClick={()=> setForm({...form, testCases: form.testCases.filter((_,i)=> i!==idx)})} disabled={form.testCases.length===1}>Remove</Button>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={()=> setForm({...form, testCases:[...form.testCases, { input:"", output:"", isHidden:false, points:1}]})}>Add test case</Button>
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!form.isPublished} onCheckedChange={v=> setForm({...form, isPublished: !!v})} /> Published (visible to candidates)</label>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={()=> setFormOpen(false)}>Cancel</Button><Button type="submit" className="bg-gradient-primary" disabled={save.isPending}>{save.isPending?"Saving…": editId?"Save":"Create"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Bulk Import Coding Questions</DialogTitle><DialogDescription>
            CSV header: <code className="block mt-2 p-2 rounded bg-muted text-[11px] break-all">title,description,difficulty,category,tags,testCase1Input,testCase1Output,testCase1Hidden</code>
            difficulty: easy/medium/hard, category: {CATS.slice(0,4).join(",")}… Max 100 rows.
          </DialogDescription></DialogHeader>
          <Textarea rows={10} placeholder={"title,description,difficulty,category,testCase1Input,testCase1Output\nTwo Sum,Given array...,easy,arrays,\"1 2\",\"3\","} value={bulkText} onChange={e=> setBulkText(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={dryRun} onCheckedChange={v=> setDryRun(!!v)} /> Dry run (validate only)</label>
          <DialogFooter><Button variant="outline" onClick={()=> setBulkOpen(false)}>Cancel</Button><Button className="bg-gradient-primary" disabled={bulk.isPending || !bulkText.trim()} onClick={()=> bulk.mutate()}>{bulk.isPending?"Importing…":"Import"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o=> !o && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete?</AlertDialogTitle><AlertDialogDescription>“{deleteTarget?.title}” will be permanently removed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" disabled={del.isPending} onClick={()=> deleteTarget && del.mutate(deleteTarget._id)}>{del.isPending?"Deleting…":"Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminCodingQuestions;
