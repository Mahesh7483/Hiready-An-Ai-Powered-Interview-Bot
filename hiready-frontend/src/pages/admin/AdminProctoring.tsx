import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ShieldAlert, Camera, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { adminAPI } from "@/lib/adminApi";
import { toast } from "sonner";

const AdminProctoring = () => {
  const [page, setPage] = useState(1);
  const [event, setEvent] = useState("all");
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);

  const openSnapshot = async (logId: string) => {
    try {
      const data = await adminAPI.getSnapshot(logId);
      if (typeof data === "string") setSnapshotUrl(data);
    } catch { /* ignore */ }
  };

  const logsQuery = useQuery({
    queryKey: ["admin-proctor-logs", page, event, sessionId],
    queryFn: () => adminAPI.getProctorLogs({ page, limit: 20, event, sessionId }),
    placeholderData: (prev) => prev,
    refetchInterval: 15000, // live-ish feed
  });

  const data = logsQuery.data;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Proctoring Feed</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            {data ? `${data.total} events` : "Loading…"}
            <span className="inline-flex items-center gap-1 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              auto-refreshes every 15s
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Filter by session ID…"
            value={sessionIdInput}
            onChange={(e) => setSessionIdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                setSessionId(sessionIdInput.trim());
              }
            }}
            className="w-56"
          />
          <Select value={event} onValueChange={(v) => { setEvent(v); setPage(1); }}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {(data?.eventTypes ?? []).map((t) => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            const csv = await adminAPI.exportProctorLogsCsv({ event, sessionId });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'proctor-logs.csv';
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Proctor logs CSV downloaded');
          } catch {
            toast.error('Failed to export proctor logs');
          }
        }}
      >
        <Download className="mr-2 w-4 h-4" /> Export CSV
      </Button>
      </div>

      <Card className="border border-border overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-destructive" />
            Suspicious Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead className="min-w-[160px]">Session</TableHead>
                <TableHead>Detected At</TableHead>
                <TableHead>Evidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logsQuery.isLoading &&
                [...Array(6)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(4)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}

              {!logsQuery.isLoading && data?.logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    No proctor events found — clean sessions so far.
                  </TableCell>
                </TableRow>
              )}

              {data?.logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Badge variant="destructive">{log.event.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{log.user?.email || "Unknown"}</p>
                    {log.user?.name && (
                      <p className="text-xs text-muted-foreground">{log.user.name}</p>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                    {log.sessionId}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {log.hasSnapshot ? (
                      <Button variant="outline" size="sm" onClick={() => openSnapshot(log.id)}>
                        <Camera className="w-3.5 h-3.5 mr-1" /> View
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {data.page} of {data.pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || logsQuery.isFetching}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.pages || logsQuery.isFetching}
              onClick={() => setPage((p) => Math.min(p + 1, data.pages))}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Snapshot lightbox */}
      {snapshotUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setSnapshotUrl(null)}
        >
          <img src={snapshotUrl} alt="Violation evidence snapshot" className="max-w-3xl max-h-[85vh] rounded-lg border border-border shadow-2xl" />
        </div>
      )}
    </div>
  );
};

export default AdminProctoring;
