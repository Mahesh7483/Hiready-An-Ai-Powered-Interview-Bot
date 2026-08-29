import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, ClipboardList, ShieldAlert, TrendingUp, UserPlus } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { adminAPI } from "@/lib/adminApi";

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--success))", "hsl(var(--warning))"];

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}> = ({ icon, label, value, sub }) => (
  <Card className="border border-border">
    <CardContent className="pt-6 flex items-center gap-4">
      <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </CardContent>
  </Card>
);

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
};

const AdminOverview = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: adminAPI.getOverview,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="h-28 animate-pulse bg-muted/40 border-border" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  }

  const pieData = data!.questionsByCategory.filter((c) => c.count > 0);
  const violationData = data!.violationEvents.map((v) => ({
    event: v.event.replace(/_/g, " "),
    count: v.count,
  }));

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform activity at a glance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5 text-primary" />}
          label="Total Users"
          value={data!.totals.users}
          sub={`+${data!.totals.newUsers30d} in last 30 days`}
        />
        <StatCard
          icon={<ClipboardList className="w-5 h-5 text-accent" />}
          label="Tests Taken"
          value={data!.totals.tests}
          sub={`${data!.totals.tests7d} in last 7 days`}
        />
        <StatCard
          icon={<BookOpen className="w-5 h-5 text-success" />}
          label="Question Bank"
          value={data!.totals.questions}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-warning" />}
          label="Avg Test Score"
          value={`${data!.avgScorePct}%`}
        />
        <StatCard
          icon={<ShieldAlert className="w-5 h-5 text-destructive" />}
          label="Proctor Events (30d)"
          value={data!.violationEvents.reduce((sum, v) => sum + v.count, 0)}
        />
        <StatCard
          icon={<UserPlus className="w-5 h-5 text-primary" />}
          label="New Users (30d)"
          value={data!.totals.newUsers30d}
        />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">Tests Taken — Last 14 Days</CardTitle>
            <CardDescription>Daily volume across practice and test modes</CardDescription>
          </CardHeader>
          <CardContent>
            {data!.testsOverTime.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No tests recorded yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data!.testsOverTime}>
                  <defs>
                    <linearGradient id="testFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d: string) => d.slice(5)}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#testFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">Question Bank by Category</CardTitle>
            <CardDescription>Distribution of questions per aptitude category</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No questions yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="count" nameKey="category" label>
                    {pieData.map((_e, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Proctor Violations by Type — Last 30 Days</CardTitle>
            <CardDescription>Most frequent suspicious events detected</CardDescription>
          </CardHeader>
          <CardContent>
            {violationData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No proctor events recorded</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={violationData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="event" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminOverview;
