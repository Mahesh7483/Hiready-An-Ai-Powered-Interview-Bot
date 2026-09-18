import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, Plus, Loader2, Power, PowerOff, Check } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

interface AdminCompany {
  _id: string;
  name: string;
  domain?: string;
  status: "pending" | "active" | "suspended";
  seats: number;
  membersActive: number;
  jobs: number;
  createdAt: string;
}

const get = async <T,>(p: string): Promise<T> => {
  const r = await apiFetch(p);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Failed (${r.status})`);
  return r.json();
};
const send = async <T,>(p: string, method: string, body?: unknown): Promise<T> => {
  const r = await apiFetch(p, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Failed (${r.status})`);
  return r.json();
};

const STATUS_STYLE: Record<AdminCompany["status"], "default" | "secondary" | "destructive"> = {
  active: "default",
  pending: "secondary",
  suspended: "destructive",
};

const AdminCompanies = () => {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [name, setName] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "companies", status],
    queryFn: () => get<{ companies: AdminCompany[]; total: number }>(
      `/admin/companies?limit=50${status !== "all" ? `&status=${status}` : ""}`
    ),
  });

  const create = useMutation({
    mutationFn: () => send<AdminCompany>("/admin/companies", "POST", { name: name.trim() }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["admin", "companies"] });
      toast.success("Company created as pending");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatusFor = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      send<AdminCompany>(`/admin/companies/${v.id}/status`, "PUT", { status: v.status }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["admin", "companies"] });
      toast.success(
        c.status === "suspended"
          ? "Suspended — their access is cut on the next request"
          : `Company is now ${c.status}`
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const companies = data?.companies ?? [];

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Companies</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Employers with access to the hiring side. Nothing works until you approve them.
        </p>
      </div>

      <Card className="border border-border">
        <CardContent className="pt-6 flex flex-wrap items-center gap-3">
          <Input
            id="new-company-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company name"
            className="flex-1 min-w-[200px]"
          />
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            <Plus className="w-4 h-4 mr-2" /> Add
          </Button>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all", "pending", "active", "suspended"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-12">
          <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Loading…</span>
        </div>
      ) : isError || data === undefined ? (
        <QueryError what="companies" error={error} onRetry={() => refetch()} />
      ) : companies.length === 0 ? (
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">No companies</CardTitle>
            <CardDescription>Add one above. It starts as pending and can do nothing until approved.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {companies.map((c) => (
            <Card key={c._id} className="border border-border">
              <CardContent className="py-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{c.name}</span>
                      <Badge variant={STATUS_STYLE[c.status]}>{c.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.membersActive}/{c.seats} seats · {c.jobs} job{c.jobs === 1 ? "" : "s"}
                      {c.domain ? ` · ${c.domain}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {c.status !== "active" && (
                    <Button
                      size="sm"
                      disabled={setStatusFor.isPending}
                      onClick={() => setStatusFor.mutate({ id: c._id, status: "active" })}
                    >
                      {c.status === "pending"
                        ? <><Check className="w-3.5 h-3.5 mr-1.5" /> Approve</>
                        : <><Power className="w-3.5 h-3.5 mr-1.5" /> Reinstate</>}
                    </Button>
                  )}
                  {c.status !== "suspended" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={setStatusFor.isPending}
                      onClick={() => setStatusFor.mutate({ id: c._id, status: "suspended" })}
                    >
                      <PowerOff className="w-3.5 h-3.5 mr-1.5" /> Suspend
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Suspension is immediate: company status is re-read from the database on every recruiter
        request, so access stops on their next call rather than at their next login.
      </p>
    </div>
  );
};

export default AdminCompanies;
