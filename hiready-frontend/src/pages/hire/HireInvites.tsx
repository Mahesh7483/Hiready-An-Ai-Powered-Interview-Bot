import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import HireLayout from "@/components/hire/HireLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, EyeOff, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { hireAPI } from "@/lib/hireApi";

/**
 * Outgoing invites.
 *
 * The address is masked for everything except `accepted`, and that is the
 * server's decision, not this page's — an invite that was never accepted has
 * no consent row behind it, so returning the raw address would disclose a
 * person who has agreed to nothing. Declining is not consent either: a refusal
 * must not become a disclosure. This screen only renders what it is given.
 */

/** Status → how it reads and how it looks. Literal classes: JIT cannot see built ones. */
const STATUS: Record<string, { label: string; cls: string; note: string }> = {
  sent: {
    label: "Awaiting reply",
    cls: "bg-secondary text-foreground",
    note: "They have not opened or answered it yet.",
  },
  accepted: {
    label: "Accepted",
    cls: "bg-success/10 text-success",
    note: "They granted your company access. Their scorecard is available.",
  },
  declined: {
    label: "Declined",
    cls: "bg-muted text-muted-foreground",
    note: "They said no. Their address stays masked.",
  },
  expired: {
    label: "Expired",
    cls: "bg-muted text-muted-foreground",
    note: "The link timed out before it was used. Send a new one.",
  },
  revoked: {
    label: "Revoked",
    cls: "bg-muted text-muted-foreground",
    note: "You cancelled this invite. Its link no longer works.",
  },
};

const when = (d: string | null) =>
  (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

const HireInvites = () => {
  const qc = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["hire", "invites"],
    queryFn: hireAPI.listInvites,
    retry: false,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => hireAPI.revokeInvite(id),
    onMutate: (id: string) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hire", "invites"] });
      toast.success("Invite revoked — its link no longer works");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invites = data?.invites ?? [];

  return (
    <HireLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Invites</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Everyone your company has approached, and where each invitation stands
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-16">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading invites…</span>
        </div>
      ) : isError ? (
        /* A viewer gets the same 404 as a stranger — the list is role-gated
           because it would otherwise hand out every address the company has
           ever touched, from a route that never calls candidateAccess(). */
        <Card className="border border-border max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">Not available</CardTitle>
            <CardDescription>
              {(error as Error)?.message === "Not found"
                ? "Viewers cannot see invited addresses. Ask an owner for recruiter access."
                : (error as Error)?.message ?? "Could not load invites."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : invites.length === 0 ? (
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">No invites yet</CardTitle>
            <CardDescription>
              Open a job and invite candidates by email. Accepting is how they grant your company
              access — nothing reaches you before that.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {invites.map((i) => {
            const meta = STATUS[i.status] ?? {
              label: i.status,
              cls: "bg-secondary text-foreground",
              note: "",
            };
            const masked = i.status !== "accepted";
            return (
              <Card key={i._id} className="border border-border">
                <CardContent className="py-4 flex flex-wrap items-center gap-4 justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {masked ? (
                        <EyeOff className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm font-medium text-foreground truncate">{i.email}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Sent {when(i.createdAt)}
                      {i.status === "accepted" && i.acceptedAt ? ` · accepted ${when(i.acceptedAt)}` : ""}
                      {i.status === "sent" ? ` · expires ${when(i.expiresAt)}` : ""}
                      {meta.note ? ` · ${meta.note}` : ""}
                    </p>
                  </div>

                  {i.status === "sent" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={revoke.isPending && pendingId === i._id}
                      onClick={() => revoke.mutate(i._id)}
                    >
                      {revoke.isPending && pendingId === i._id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Undo2 className="w-3.5 h-3.5 mr-1.5" /> Revoke
                        </>
                      )}
                    </Button>
                  ) : (
                    <Badge variant="secondary" className="capitalize">{i.status}</Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {invites.some((i) => i.status !== "accepted") && (
        <p className="text-xs text-muted-foreground mt-6 max-w-2xl">
          Addresses are shown in full only where the candidate accepted. Everyone else is masked to
          a hint, because an invitation is not consent and a refusal must not become a disclosure.
        </p>
      )}
    </HireLayout>
  );
};

export default HireInvites;
