import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import HireLayout from "@/components/hire/HireLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Mail, Loader2, ExternalLink, GitCompare } from "lucide-react";
import { toast } from "sonner";
import { hireAPI, RECRUITER_STAGES, type PipelineStage } from "@/lib/hireApi";

const HireJob = () => {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [emails, setEmails] = useState("");
  const [links, setLinks] = useState<Array<{ email: string; token: string }>>([]);
  // Comparison is capped at five server-side; cap here too so the UI cannot
  // offer something the API will silently trim.
  const [picked, setPicked] = useState<string[]>([]);

  const togglePick = (candidateId: string) =>
    setPicked((prev) =>
      prev.includes(candidateId)
        ? prev.filter((x) => x !== candidateId)
        : prev.length >= 5 ? prev : [...prev, candidateId]
    );

  const { data, isLoading, isError } = useQuery({
    queryKey: ["hire", "job", id],
    queryFn: () => hireAPI.getJob(id),
    retry: false,
  });

  const invite = useMutation({
    mutationFn: () =>
      hireAPI.invite({
        emails: emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean),
        jobId: id,
      }),
    onSuccess: (res) => {
      setEmails("");
      setLinks(res.invites.map((i) => ({ email: i.email, token: i.token })));
      toast.success(`${res.invited} invite${res.invited === 1 ? "" : "s"} created`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: ({ appId, stage }: { appId: string; stage: PipelineStage }) =>
      hireAPI.moveStage(id, appId, stage),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["hire", "job", id] });
      toast.success(`Moved ${r.from} → ${r.stage}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <HireLayout>
        <div className="flex items-center gap-3 text-muted-foreground py-16">
          <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Loading job…</span>
        </div>
      </HireLayout>
    );
  }

  if (isError || !data) {
    return (
      <HireLayout>
        <Card className="border border-border max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">Job not found</CardTitle>
            <CardDescription>
              It may belong to another company, or it may not exist.
            </CardDescription>
          </CardHeader>
        </Card>
      </HireLayout>
    );
  }

  return (
    <HireLayout>
      <Link to="/hire" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Pipeline
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">{data.job.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data.applications.length} candidate{data.applications.length === 1 ? "" : "s"}
          {data.job.location ? ` · ${data.job.location}` : ""}
        </p>
      </div>

      {/* Invite */}
      <Card className="border border-border mb-8">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4" /> Invite candidates
          </CardTitle>
          <CardDescription>
            One address per line, or comma separated. Accepting the invite is how a candidate
            grants your company access — nothing reaches you before that.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            id="invite-emails"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder={"ada@example.com\ngrace@example.com"}
            rows={3}
          />
          <Button
            disabled={!emails.trim() || invite.isPending}
            onClick={() => invite.mutate()}
            className="bg-gradient-primary hover:opacity-90"
          >
            {invite.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create invites"}
          </Button>

          {links.length > 0 && (
            <div className="rounded-md border border-border bg-secondary/40 p-4">
              <p className="text-xs text-muted-foreground mb-2">
                Invite links, shown once. They are not stored and cannot be retrieved again.
              </p>
              <div className="space-y-1.5 font-mono text-xs">
                {links.map((l) => (
                  <div key={l.token} className="truncate">
                    <span className="text-muted-foreground">{l.email}</span>{" "}
                    <span className="text-foreground">{`${window.location.origin}/invite/${l.token}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Candidates
        </h2>
        {data.applications.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {picked.length === 0
                ? "Tick two to five to compare"
                : `${picked.length} selected${picked.length >= 5 ? " (max)" : ""}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={picked.length < 2}
              onClick={() => navigate(`/hire/compare?ids=${picked.join(",")}`)}
            >
              <GitCompare className="w-3.5 h-3.5 mr-1.5" /> Compare
            </Button>
          </div>
        )}
      </div>
      {data.applications.length === 0 ? (
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">Nobody yet</CardTitle>
            <CardDescription>Invited candidates appear here once they accept.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.applications.map((a) => (
            <Card key={a.applicationId} className="border border-border">
              <CardContent className="py-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0 flex items-start gap-3">
                  {a.stage !== "withdrawn" && (
                    <Checkbox
                      id={`pick-${a.applicationId}`}
                      className="mt-0.5"
                      checked={picked.includes(a.candidateId)}
                      // Unticking must always work, so only block NEW ticks at the cap.
                      disabled={!picked.includes(a.candidateId) && picked.length >= 5}
                      onCheckedChange={() => togglePick(a.candidateId)}
                      aria-label="Select for comparison"
                    />
                  )}
                  <div className="min-w-0">
                  {/* No name here: the board shows position, not people. Opening
                      the scorecard is what performs the access check. */}
                  <Link
                    to={`/hire/candidates/${a.candidateId}`}
                    className="text-sm font-medium text-primary hover:underline underline-offset-2 inline-flex items-center gap-1.5"
                  >
                    View scorecard <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    via {a.source}
                    {a.hasAttempt ? " · assessment on file" : " · no assessment yet"}
                  </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {a.stage === "withdrawn" ? (
                    <Badge variant="secondary">withdrawn</Badge>
                  ) : (
                    <Select
                      value={a.stage}
                      onValueChange={(stage) =>
                        move.mutate({ appId: a.applicationId, stage: stage as PipelineStage })
                      }
                    >
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECRUITER_STAGES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </HireLayout>
  );
};

export default HireJob;
