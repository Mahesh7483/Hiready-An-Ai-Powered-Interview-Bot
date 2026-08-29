import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { adminAPI, type AdminTestResult } from "@/lib/adminApi";
import { toast } from "sonner";

const ResultRow: React.FC<{ result: AdminTestResult }> = ({ result }) => {
  const [open, setOpen] = useState(false);
  const pct = Math.round((result.score / Math.max(result.totalQuestions, 1)) * 100);

  return (
    <>
      <TableRow onClick={() => setOpen((o) => !o)} className="cursor-pointer">
        <TableCell>
          <div className="flex items-center gap-2">
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <div>
              <p className="text-sm font-medium">{result.user?.email || result.userId}</p>
              {result.user?.name && (
                <p className="text-xs text-muted-foreground">{result.user.name}</p>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell><Badge variant="secondary">{result.topic}</Badge></TableCell>
        <TableCell className="capitalize text-muted-foreground">{result.mode}</TableCell>
        <TableCell>
          <Badge variant={pct >= 60 ? "secondary" : "destructive"}>
            {result.score}/{result.totalQuestions} ({pct}%)
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {result.timeTaken || "—"}
        </TableCell>
        <TableCell>
          {result.warningCount > 0 ? (
            <Badge variant="destructive">{result.warningCount}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">0</span>
          )}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(result.createdAt).toLocaleString()}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={7}>
            <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-2 max-h-72 overflow-y-auto">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Answers ({result.selectedAnswers.length})
              </p>
              {result.selectedAnswers.map((a, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="font-mono text-xs text-muted-foreground w-24 truncate">
                    …{a.questionId.slice(-6)}
                  </span>
                  <span>Selected: {a.selected}</span>
                  {!a.isCorrect && a.correctAnswer && (
                    <span className="text-muted-foreground">Correct: {a.correctAnswer}</span>
                  )}
                  <Badge variant={a.isCorrect ? "secondary" : "destructive"} className="ml-auto">
                    {a.isCorrect ? "correct" : "wrong"}
                  </Badge>
                </div>
              ))}
              {result.selectedAnswers.length === 0 && (
                <p className="text-xs text-muted-foreground">No answer detail stored for this attempt.</p>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

const AdminResults = () => {
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState("all");
  const [topic, setTopic] = useState("all");

  const resultsQuery = useQuery({
    queryKey: ["admin-results", page, mode, topic],
    queryFn: () => adminAPI.getResults({ page, limit: 15, mode, topic }),
    placeholderData: (prev) => prev,
  });

  const data = resultsQuery.data;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Test Results</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data ? `${data.total} attempts recorded` : "Loading…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={mode} onValueChange={(v) => { setMode(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              <SelectItem value="test">Test</SelectItem>
              <SelectItem value="practice">Practice</SelectItem>
            </SelectContent>
          </Select>
          <Select value={topic} onValueChange={(v) => { setTopic(v); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              <SelectItem value="logical">Logical</SelectItem>
              <SelectItem value="quantitative">Quantitative</SelectItem>
              <SelectItem value="verbal">Verbal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              const csv = await adminAPI.exportResultsCsv({ mode, topic });
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'test-results.csv';
              a.click();
              URL.revokeObjectURL(url);
              toast.success('Results CSV downloaded');
            } catch {
              toast.error('Failed to export results');
            }
          }}
        >
          <Download className="mr-2 w-4 h-4" /> Export CSV
        </Button>
      </div>

      <Card className="border border-border overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Warnings</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultsQuery.isLoading &&
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}

              {!resultsQuery.isLoading && data?.results.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    No results found
                  </TableCell>
                </TableRow>
              )}

              {data?.results.map((r) => <ResultRow key={r._id} result={r} />)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {data.page} of {data.pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || resultsQuery.isFetching}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.pages || resultsQuery.isFetching}
              onClick={() => setPage((p) => Math.min(p + 1, data.pages))}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminResults;
