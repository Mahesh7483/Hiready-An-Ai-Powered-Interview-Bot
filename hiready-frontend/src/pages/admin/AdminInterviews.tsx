import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Flag, Clock, ShieldAlert, Video } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { adminAPI } from "@/lib/adminApi";

const formatDuration = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

const AdminInterviews = () => {
  const [page, setPage] = useState(1);
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: ["admin-interview-sessions", page, flaggedOnly],
    queryFn: () => adminAPI.getInterviewSessions({ page, limit: 20, flagged: flaggedOnly }),
    placeholderData: (prev) => prev,
  });

  const data = sessionsQuery.data;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Interview Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data ? `${data.total} sessions` : "Loading…"} — terminated sessions surface first
          </p>
        </div>
        <Button
          variant={flaggedOnly ? "destructive" : "outline"}
          size="sm"
          onClick={() => { setFlaggedOnly((v) => !v); setPage(1); }}
        >
          <Flag className="w-4 h-4 mr-2" />
          {flaggedOnly ? "Showing flagged only" : "Show flagged only"}
        </Button>
      </div>

      <Card className="border border-border overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Video className="w-4 h-4 text-primary" />
            All Mock Interviews
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Integrity</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessionsQuery.isLoading &&
                [...Array(6)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(6)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}

              {!sessionsQuery.isLoading && data?.sessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    No interview sessions recorded yet.
                  </TableCell>
                </TableRow>
              )}

              {data?.sessions.map((s) => {
                const terminated = s.integrity?.terminated;
                return (
                  <TableRow key={s._id} className={terminated ? "bg-destructive/5" : ""}>
                    <TableCell>
                      <p className="text-sm font-medium">{s.user?.email || "Unknown"}</p>
                      {s.user?.name && <p className="text-xs text-muted-foreground">{s.user.name}</p>}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{s.role}</p>
                      <p className="text-xs text-muted-foreground">{s.experienceLevel}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${s.mode === "assessment" ? "border-destructive/40 text-destructive" : "border-success/40 text-success"}`}>
                        {s.mode}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        {formatDuration(s.durationSeconds)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                        terminated ? "text-destructive" : (s.integrity?.violations ?? 0) > 0 ? "text-warning" : "text-success"
                      }`}>
                        <ShieldAlert className="w-4 h-4" />
                        {s.integrity?.violations ?? 0}/{s.integrity?.maxViolations ?? 3}
                        {terminated && <Badge variant="destructive" className="ml-1 text-[10px]">TERMINATED</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(s.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {data.page} of {data.pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || sessionsQuery.isFetching}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.pages || sessionsQuery.isFetching}
              onClick={() => setPage((p) => Math.min(p + 1, data.pages))}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminInterviews;
