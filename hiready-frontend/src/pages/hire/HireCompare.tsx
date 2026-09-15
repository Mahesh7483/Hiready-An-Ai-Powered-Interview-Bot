import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import HireLayout from "@/components/hire/HireLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, ShieldCheck, ShieldAlert, ShieldX, EyeOff } from "lucide-react";
import { hireAPI, type IntegrityVerdict, type Scorecard } from "@/lib/hireApi";

/**
 * Side-by-side comparison.
 *
 * Deliberately no composite "best candidate" score. People who sat different
 * instruments are not comparable on one number, and presenting one anyway
 * would be a confident figure that is simply wrong — worse than no feature.
 * So this compares section by section and says plainly where it cannot.
 *
 * Every candidate shown here passed candidateAccess() on the server and is
 * written to the disclosure audit, one row each. A candidate the caller cannot
 * see is absent rather than an error, so the response shape reveals nothing.
 */

const VERDICT: Record<IntegrityVerdict, { label: string; icon: typeof ShieldCheck; cls: string }> = {
  clean: { label: "Clean", icon: ShieldCheck, cls: "text-success" },
  flagged: { label: "Flagged", icon: ShieldAlert, cls: "text-warning" },
  invalidated: { label: "Invalidated", icon: ShieldX, cls: "text-destructive" },
  unknown: { label: "Not evaluated", icon: EyeOff, cls: "text-muted-foreground" },
};

const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);

/** Best percent per section type, so like is compared with like. */
function sectionScores(card: Scorecard): Map<string, number> {
  const out = new Map<string, number>();
  card.assessments.forEach((a) => {
    a.sections.forEach((s) => {
      if (s.percent == null) return;
      const prev = out.get(s.type);
      if (prev == null || s.percent > prev) out.set(s.type, s.percent);
    });
  });
  return out;
}

const HireCompare = () => {
  const [params] = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["hire", "compare", ids.join(",")],
    queryFn: () => hireAPI.compare(ids),
    enabled: ids.length >= 2,
    retry: false,
  });

  const cards = data?.candidates ?? [];

  // The union of every section type anyone sat, so a blank cell reads as
  // "did not sit this" rather than silently dropping the row.
  const allTypes = Array.from(
    new Set(cards.flatMap((c) => [...sectionScores(c).keys()]))
  ).sort();

  const scores = new Map(cards.map((c) => [c.candidateId, sectionScores(c)]));

  const best = (type: string) => {
    const values = cards
      .map((c) => scores.get(c.candidateId)?.get(type))
      .filter((v): v is number => v != null);
    return values.length > 1 ? Math.max(...values) : null;
  };

  return (
    <HireLayout>
      <Link
        to="/hire"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Pipeline
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Compare candidates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Section by section. No overall ranking — see the note at the foot of the page.
        </p>
      </div>

      {ids.length < 2 ? (
        <Card className="border border-border max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">Pick at least two</CardTitle>
            <CardDescription>
              Open a job, tick two to five candidates on the board, then choose Compare.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-16">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading scorecards…</span>
        </div>
      ) : isError ? (
        <Card className="border border-border max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">Could not compare</CardTitle>
            <CardDescription>{(error as Error)?.message ?? "Request failed."}</CardDescription>
          </CardHeader>
        </Card>
      ) : cards.length === 0 ? (
        <Card className="border border-border max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">Nothing to show</CardTitle>
            <CardDescription>
              None of the selected candidates are available to your company. They may have revoked
              access, or never granted it.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {cards.length < ids.length && (
            <Card className="border border-border mb-6">
              <CardContent className="py-4 flex items-start gap-3">
                <EyeOff className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Showing {cards.length} of {ids.length}. The rest are not available to your
                  company — they may have revoked access since you last looked.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-muted-foreground py-3 pr-4 w-44">
                    Candidate
                  </th>
                  {cards.map((c) => (
                    <th key={c.candidateId} className="text-left py-3 px-4 align-bottom">
                      <Link
                        to={`/hire/candidates/${c.candidateId}`}
                        className="font-semibold text-foreground hover:text-primary hover:underline underline-offset-2"
                      >
                        {c.identity ? c.identity.name : "Candidate"}
                      </Link>
                      <div className="text-xs font-normal text-muted-foreground truncate max-w-[180px]">
                        {c.identity ? c.identity.email : "identity hidden for your role"}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allTypes.map((type) => {
                  const top = best(type);
                  return (
                    <tr key={type} className="border-b border-border">
                      <td className="py-3 pr-4 text-muted-foreground capitalize">{type}</td>
                      {cards.map((c) => {
                        const v = scores.get(c.candidateId)?.get(type) ?? null;
                        const leads = top != null && v === top;
                        return (
                          <td key={c.candidateId} className="py-3 px-4">
                            <span
                              className={
                                v == null
                                  ? "text-muted-foreground"
                                  : leads
                                    ? "font-semibold text-success"
                                    : "text-foreground"
                              }
                            >
                              {v == null ? "did not sit" : pct(v)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                <tr className="border-b border-border">
                  <td className="py-3 pr-4 text-muted-foreground">Integrity</td>
                  {cards.map((c) => {
                    // The worst verdict across their attempts. A single
                    // invalidated run is the thing a recruiter needs to see.
                    const order: IntegrityVerdict[] = ["invalidated", "flagged", "unknown", "clean"];
                    const worst =
                      order.find((v) => c.assessments.some((a) => a.integrity === v)) ?? "unknown";
                    const meta = VERDICT[worst];
                    const Icon = meta.icon;
                    return (
                      <td key={c.candidateId} className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 ${meta.cls}`}>
                          <Icon className="w-4 h-4" /> {meta.label}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                <tr className="border-b border-border">
                  <td className="py-3 pr-4 text-muted-foreground">Interview</td>
                  {cards.map((c) => (
                    <td key={c.candidateId} className="py-3 px-4 text-foreground">
                      {c.interviews.length === 0 ? (
                        <span className="text-muted-foreground">none</span>
                      ) : (
                        pct(c.interviews[0].overallScore)
                      )}
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="py-3 pr-4 text-muted-foreground">Resume (ATS)</td>
                  {cards.map((c) => (
                    <td key={c.candidateId} className="py-3 px-4 text-foreground">
                      {c.resume ? pct(c.resume.atsScore) : <span className="text-muted-foreground">none</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground mt-6 max-w-2xl">
            There is no combined score here on purpose. These candidates may have sat different
            instruments, so a single ranked number would be a confident figure with nothing behind
            it. Compare the sections that overlap, and treat “did not sit” as missing evidence
            rather than a low score.
          </p>
        </>
      )}
    </HireLayout>
  );
};

export default HireCompare;
