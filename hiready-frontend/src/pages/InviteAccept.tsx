import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { consentAPI } from "@/lib/hireApi";

/**
 * The consent moment.
 *
 * Accepting an invite IS the consent event, so this screen must say plainly
 * what the company will get BEFORE the button is pressed. Anything less and
 * the consent is not informed.
 */
const InviteAccept = () => {
  const { token = "" } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => consentAPI.previewInvite(token),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => consentAPI.acceptInvite(token),
    onSuccess: () => {
      toast.success("Invitation accepted");
      navigate("/privacy");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decline = useMutation({
    mutationFn: () => consentAPI.declineInvite(token),
    onSuccess: () => {
      toast.success("Invitation declined");
      navigate("/mastery");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="border border-border w-full max-w-lg">
        {isLoading ? (
          <CardContent className="py-16 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Loading invitation…</span>
          </CardContent>
        ) : isError || !data ? (
          <>
            <CardHeader>
              <CardTitle>Invitation unavailable</CardTitle>
              <CardDescription>
                {(error as Error)?.message
                  || "This invitation may have expired, been withdrawn, or already been used."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/mastery"><Button variant="outline">Back to HiREady</Button></Link>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">{data.company} wants to assess you</CardTitle>
              <CardDescription>
                Invitation sent to {data.email} · expires{" "}
                {new Date(data.expiresAt).toLocaleDateString()}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* Said before the decision, not after. */}
              <div className="rounded-lg border border-border bg-secondary/40 p-4">
                <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" /> If you accept, they will see
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                  <li>Your name and email</li>
                  <li>Results of assessments you take for them</li>
                  <li>Your interview scores and resume analysis</li>
                </ul>
                <p className="text-sm font-medium text-foreground mt-4 mb-2">They will never see</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                  <li>Your practice history, drills, or wrong answers</li>
                  <li>Webcam images or interview recordings</li>
                  <li>Anything about other companies you are talking to</li>
                </ul>
              </div>

              <p className="text-xs text-muted-foreground">
                You can revoke this at any time from your privacy settings. Revoking stops future
                access; an assessment they have already run stays with them.
              </p>

              <div className="flex flex-wrap gap-3">
                <Button
                  className="bg-gradient-primary hover:opacity-90 flex-1 min-w-[140px]"
                  disabled={accept.isPending}
                  onClick={() => accept.mutate()}
                >
                  {accept.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <>Accept <ArrowRight className="w-4 h-4 ml-2" /></>}
                </Button>
                <Button
                  variant="outline"
                  disabled={decline.isPending}
                  onClick={() => decline.mutate()}
                >
                  Decline
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
};

export default InviteAccept;
