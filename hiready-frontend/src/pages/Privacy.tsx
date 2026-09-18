import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Eye, EyeOff, Loader2, Hand } from "lucide-react";
import { toast } from "sonner";
import { consentAPI } from "@/lib/hireApi";

/**
 * The screen that makes the hiring product defensible: a student sees exactly
 * which companies can see them, and takes it back in one click.
 *
 * The revoke copy is deliberately honest — it says what revoking does NOT do.
 */
const STATE_COPY: Record<string, { label: string; help: string; variant: "default" | "secondary" | "outline" }> = {
  DISCOVERABLE: {
    label: "Can find you",
    help: "They can see your scores without your name or email.",
    variant: "outline",
  },
  REVEALED: {
    label: "Can see you",
    help: "They can see your name, email, assessment results, interview scores and resume analysis.",
    variant: "default",
  },
  IN_PROCESS: {
    label: "Interviewing you",
    help: "You have a live application with this company.",
    variant: "default",
  },
};

const Privacy = () => {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["consent", "me"],
    queryFn: consentAPI.mine,
  });

  const revoke = useMutation({
    mutationFn: (companyId: string) => consentAPI.revoke(companyId),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["consent", "me"] });
      toast.success("Access revoked", { description: r.note });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reveal = useMutation({
    mutationFn: (companyId: string) => consentAPI.reveal(companyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consent", "me"] });
      toast.success("They can now see your profile");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.companies ?? [];

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Who can see you</h1>
          <p className="text-muted-foreground">
            Practising on HiREady is private. Employers see nothing unless you let them.
          </p>
        </div>

        <Card className="border border-border mb-8">
          <CardContent className="py-5 flex items-start gap-3">
            <Shield className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="text-foreground font-medium mb-1">Your practice is never shared.</p>
              <p>
                Aptitude drills, wrong answers, and attempts you abandoned are yours alone — no
                employer can see them, ever. Only assessments you were invited to, and the scores
                from them, can be shared, and only with companies listed below.
              </p>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center gap-3 text-muted-foreground py-16">
            <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Loading…</span>
          </div>
        ) : isError || data === undefined ? (
          /* This branch must come before the empty check. Without it a failed
             request fell through to "No company can see you" — telling someone
             they are private at the one moment we cannot know whether they are.
             On this screen in particular, a reassuring guess is the worst
             possible answer. */
          <QueryError what="who can see you" error={error} onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <Card className="border border-border">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center mb-2">
                <EyeOff className="w-6 h-6 text-success" />
              </div>
              <CardTitle>No company can see you</CardTitle>
              <CardDescription>
                You are completely private. If an employer invites you to an assessment, you will
                be shown exactly what they would get before you decide.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-4">
            {rows.map((c) => {
              const copy = STATE_COPY[c.state] ?? STATE_COPY.REVEALED;
              return (
                <Card key={c.consentId} className="border border-border">
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="font-semibold text-foreground truncate">
                            {c.company ? c.company.name : "Unknown company"}
                          </h2>
                          <Badge variant={copy.variant}>{copy.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{copy.help}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Since {new Date(c.grantedAt).toLocaleDateString()} · via {c.source}
                        </p>

                        {c.interestAt && c.state === "DISCOVERABLE" && (
                          <div className="mt-3 flex items-center gap-2 text-sm">
                            <Hand className="w-4 h-4 text-warning" />
                            <span className="text-foreground">
                              This company asked to see your full profile.
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {c.state === "DISCOVERABLE" && c.interestAt && c.company && (
                          <Button
                            size="sm"
                            className="bg-gradient-primary hover:opacity-90"
                            disabled={reveal.isPending}
                            onClick={() => reveal.mutate(c.company!.id)}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1.5" /> Reveal
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          disabled={revoke.isPending || !c.company}
                          onClick={() => c.company && revoke.mutate(c.company.id)}
                        >
                          Revoke
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <p className="text-xs text-muted-foreground px-1">
              Revoking stops a company seeing you and stops any new results reaching them. An
              assessment they already ran stays with them — we cannot take that back, and would
              rather say so than pretend otherwise.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Privacy;
