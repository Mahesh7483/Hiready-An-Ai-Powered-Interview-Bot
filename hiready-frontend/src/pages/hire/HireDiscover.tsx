import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import HireLayout from "@/components/hire/HireLayout";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Loader2, Hand } from "lucide-react";
import { toast } from "sonner";
import { hireAPI } from "@/lib/hireApi";

/**
 * Pseudonymous discovery.
 *
 * Only candidates who opted in to THIS company appear, and none of them can be
 * resolved to a person here — the server issues no capability for a
 * DISCOVERABLE consent. A recruiter can ask; only the candidate can answer.
 */
const HireDiscover = () => {
  const [minScore, setMinScore] = useState("0");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["hire", "discover", minScore],
    queryFn: () => hireAPI.discover({ minScore: Number(minScore), limit: 50 }),
  });

  const interest = useMutation({
    mutationFn: (handle: string) => hireAPI.expressInterest(handle),
    onSuccess: () => {
      toast.success("Interest sent — the candidate decides whether to reveal");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.candidates ?? [];

  return (
    <HireLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Discover</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Candidates who have opened themselves to your company, shown without identities
        </p>
      </div>

      <Card className="border border-border mb-6">
        <CardContent className="pt-6 flex flex-wrap items-center gap-3">
          <Search className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Minimum assessment score</span>
          <Select value={minScore} onValueChange={setMinScore}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["0", "50", "60", "70", "80"].map((v) => (
                <SelectItem key={v} value={v}>{v === "0" ? "Any" : `${v}%+`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-16">
          <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Searching…</span>
        </div>
      ) : isError || data === undefined ? (
        <QueryError what="matching candidates" error={error} onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">Nobody to show</CardTitle>
            <CardDescription>
              Only candidates who have opted in to your company appear here. Everyone else is
              absent rather than anonymised — there is no wider pool behind this view.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <Card key={c.handle} className="border border-border">
              <CardContent className="py-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Candidate {String(c.handle).slice(-6)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.assessments} assessment{c.assessments === 1 ? "" : "s"} · last active{" "}
                    {c.lastActiveAt ? new Date(c.lastActiveAt).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xl font-bold text-foreground">
                      {c.assessmentPercent != null ? `${c.assessmentPercent}%` : "—"}
                    </div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">verified</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={interest.isPending}
                    onClick={() => interest.mutate(c.handle)}
                  >
                    <Hand className="w-3.5 h-3.5 mr-1.5" /> Express interest
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </HireLayout>
  );
};

export default HireDiscover;
