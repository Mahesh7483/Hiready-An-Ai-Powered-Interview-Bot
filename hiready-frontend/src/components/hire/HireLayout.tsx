import { useEffect, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Users, Search, ArrowLeft, Loader2, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { hireAPI, getActiveCompany, setActiveCompany } from "@/lib/hireApi";

/**
 * The recruiter shell. Separate from both the student sidebar and the admin
 * panel — different people, different job, different permissions.
 *
 * Access is decided by the server: /hire/me lists the companies this user may
 * act as. A user in more than one must pick, because the server refuses to
 * guess — picking arbitrarily is how a recruiter ends up acting on the wrong
 * company's pipeline.
 */
const NAV = [
  { to: "/hire", label: "Pipeline", icon: Briefcase, end: true },
  { to: "/hire/discover", label: "Discover", icon: Search, end: false },
];

const HireLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["hire", "me"],
    queryFn: hireAPI.me,
    retry: false,
  });

  const companies = data?.companies ?? [];

  // Held in React state, not read from localStorage during render: localStorage
  // is not reactive, so a switch would store the new company but leave the UI
  // showing the old one until a manual reload.
  const [selected, setSelected] = useState<string | null>(() => getActiveCompany());
  const valid = companies.some((c) => c.companyId === selected);
  const active = valid ? selected : companies.length === 1 ? companies[0].companyId : null;

  // Settle on a company as soon as one is unambiguous, and drop a stale
  // selection left over from a membership that has since been removed.
  useEffect(() => {
    if (!companies.length) return;
    if (!valid && companies.length === 1) {
      setActiveCompany(companies[0].companyId);
      setSelected(companies[0].companyId);
    } else if (selected && !valid) {
      // A membership that has since been removed.
      setActiveCompany(null);
      setSelected(null);
    }
  }, [companies, valid, selected]);

  const switchTo = (id: string) => {
    setActiveCompany(id);
    setSelected(id);
    // Every cached response was scoped to the previous company, so none of it
    // may be shown under the new one.
    qc.removeQueries({ queryKey: ["hire", "jobs"] });
    qc.removeQueries({ queryKey: ["hire", "job"] });
    qc.removeQueries({ queryKey: ["hire", "candidate"] });
    qc.removeQueries({ queryKey: ["hire", "discover"] });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto" />
          <p className="mt-3 text-sm text-muted-foreground">Checking your access…</p>
        </div>
      </div>
    );
  }

  if (isError || !companies.length) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <ShieldX className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">No hiring access</h1>
          <p className="text-sm text-muted-foreground mt-2">
            This area is for employers. If your company should have access, ask your
            administrator to add you to its team.
          </p>
          <Link to="/dashboard">
            <Button variant="outline" className="mt-6">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to HiREady
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const current = companies.find((c) => c.companyId === active);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8 min-w-0">
            <span className="font-bold text-foreground shrink-0">HiREady for employers</span>
            <nav className="flex items-center gap-1">
              {NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? "bg-secondary text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                      }`
                    }
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {companies.length > 1 ? (
              <Select value={active ?? ""} onValueChange={switchTo}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="Choose a company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.companyId} value={c.companyId}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm text-foreground">{companies[0].name}</span>
            )}
            {current && (
              <span className="text-xs text-muted-foreground capitalize">{current.role}</span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {!active ? (
          <div className="py-16 text-center">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <h2 className="font-semibold text-foreground">Choose a company</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              You belong to more than one. Pick which you are acting as — nothing loads until you
              do, so you can never act on the wrong pipeline by accident.
            </p>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
};

export default HireLayout;
