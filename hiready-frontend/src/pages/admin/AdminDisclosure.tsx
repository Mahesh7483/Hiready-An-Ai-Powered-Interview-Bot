import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, Loader2, KeyRound, EyeOff, Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

interface DisclosureEvent {
  id: string;
  action: "granted" | "revoked" | "state_changed" | "disclosed";
  scopes: string[];
  at: string;
  candidate: { id: string; name: string | null; email: string | null };
  company: { id: string; name: string | null };
  consentId: string | null;
  meta: Record<string, unknown>;
}

const ACTION: Record<DisclosureEvent["action"], { icon: typeof Eye; cls: string; label: string }> = {
  granted: { icon: KeyRound, cls: "text-success", label: "granted" },
  disclosed: { icon: Eye, cls: "text-metric", label: "disclosed" },
  state_changed: { icon: RefreshCw, cls: "text-warning", label: "changed" },
  revoked: { icon: EyeOff, cls: "text-destructive", label: "revoked" },
};

const AdminDisclosure = () => {
  const [action, setAction] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "disclosure", action],
    queryFn: async () => {
      const r = await apiFetch(`/admin/disclosure?limit=50${action !== "all" ? `&action=${action}` : ""}`);
      if (!r.ok) throw new Error("Failed to load disclosure log");
      return r.json() as Promise<{ events: DisclosureEvent[]; total: number }>;
    },
  });

  const exportCsv = async () => {
    try {
      const r = await apiFetch("/admin/disclosure/export.csv");
      if (!r.ok) throw new Error("Export failed");
      const text = await r.text();
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "disclosure.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const events = data?.events ?? [];

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Disclosure</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Whose data left the platform, to whom, and on what authority
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      <Card className="border border-border">
        <CardContent className="pt-6 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">Action</span>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all", "granted", "disclosed", "state_changed", "revoked"].map((a) => (
                <SelectItem key={a} value={a}>{a.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground ml-auto">
            {data?.total ?? 0} event{(data?.total ?? 0) === 1 ? "" : "s"}
          </span>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-12">
          <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Loading…</span>
        </div>
      ) : events.length === 0 ? (
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">Nothing disclosed yet</CardTitle>
            <CardDescription>
              Every consent grant, identity disclosure and revocation is recorded here permanently
              — including after the consent itself is revoked.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map((e) => {
            const a = ACTION[e.action] ?? ACTION.disclosed;
            const Icon = a.icon;
            return (
              <Card key={e.id} className="border border-border">
                <CardContent className="py-3 flex flex-wrap items-center gap-3 justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${a.cls}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">
                        <span className="font-medium">
                          {e.candidate.name || e.candidate.email || e.candidate.id}
                        </span>
                        <span className="text-muted-foreground"> {a.label} to </span>
                        <span className="font-medium">{e.company.name || e.company.id}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(e.at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {e.scopes.length === 0 ? (
                      <Badge variant="outline" className="font-normal">no identifying data</Badge>
                    ) : (
                      e.scopes.map((s) => (
                        <Badge key={s} variant="outline" className="font-normal">{s}</Badge>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminDisclosure;
