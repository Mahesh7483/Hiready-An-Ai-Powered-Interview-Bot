import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import HireLayout from "@/components/hire/HireLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Plus, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { hireAPI, type PipelineStage } from "@/lib/hireApi";

/** Funnel order, left to right. Withdrawn sits apart — it is not progress. */
const FUNNEL: PipelineStage[] = [
  "invited", "started", "completed", "shortlisted", "interviewing", "offered", "hired",
];

const HirePipeline = () => {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["hire", "jobs"], queryFn: hireAPI.listJobs });

  const createJob = useMutation({
    mutationFn: () => hireAPI.createJob({ title: title.trim() }),
    onSuccess: () => {
      setTitle("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["hire", "jobs"] });
      toast.success("Job created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const jobs = data?.jobs ?? [];

  return (
    <HireLayout>
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every open role and where its candidates stand
          </p>
        </div>
        <Button onClick={() => setCreating((v) => !v)} className="bg-gradient-primary hover:opacity-90">
          <Plus className="w-4 h-4 mr-2" /> New job
        </Button>
      </div>

      {creating && (
        <Card className="border border-border mb-6">
          <CardContent className="pt-6 flex flex-wrap gap-3 items-center">
            <Input
              id="new-job-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Job title, e.g. Backend Engineer"
              className="flex-1 min-w-[220px]"
            />
            <Button
              disabled={!title.trim() || createJob.isPending}
              onClick={() => createJob.mutate()}
            >
              {createJob.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-16">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading your pipeline…</span>
        </div>
      ) : jobs.length === 0 ? (
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">No jobs yet</CardTitle>
            <CardDescription>
              Create a job, attach an assessment, then invite candidates by email. They see
              exactly what they are agreeing to share before anything reaches you.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <Card key={job._id} className="border border-border hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-muted-foreground shrink-0" />
                      <h2 className="font-semibold text-foreground truncate">{job.title}</h2>
                      <Badge variant={job.status === "open" ? "default" : "secondary"}>
                        {job.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {job.total ?? 0} candidate{(job.total ?? 0) === 1 ? "" : "s"}
                      {job.location ? ` · ${job.location}` : ""}
                    </p>
                  </div>
                  <Link to={`/hire/jobs/${job._id}`}>
                    <Button variant="outline" size="sm">
                      Open <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>

                {/* Funnel counts. Identity is deliberately absent from this
                    view — position in the pipeline is not a person. */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {FUNNEL.map((stage) => {
                    const n = job.funnel?.[stage] ?? 0;
                    return (
                      <div
                        key={stage}
                        className={`rounded-md border px-2 py-2 text-center ${
                          n > 0 ? "border-border bg-secondary/40" : "border-border/60"
                        }`}
                      >
                        <div className={`text-lg font-bold ${n > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                          {n}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {stage}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </HireLayout>
  );
};

export default HirePipeline;
