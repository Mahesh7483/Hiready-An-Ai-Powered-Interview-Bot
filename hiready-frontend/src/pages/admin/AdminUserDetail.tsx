import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import { ChevronLeft, FileText, MessageSquare, Award, ShieldAlert, Clock, History, TrendingUp, Video } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { adminAPI, type AdminUser, type AdminTestResult, type AdminProctorLog, type AdminInterviewSession } from "@/lib/adminApi";
import { toast } from "sonner";
import { fetchResumeHistory, type ResumeHistoryItem } from "@/lib/historyApi";
import { fetchInterviewSessions, type InterviewSessionSummary } from "@/lib/historyApi";
import DashboardLayout from "@/components/DashboardLayout";

interface UserDetail {
  _id: string;
  name: string;
  email: string;
  role: string;
  firebaseUid?: string;
  createdAt: string;
}

type UserDetailTab = "overview" | "resumes" | "interviews" | "tests" | "proctoring";

const AdminUserDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [resumes, setResumes] = useState<ResumeHistoryItem[]>([]);
  const [interviews, setInterviews] = useState<AdminInterviewSession[]>([]);
  const [results, setResults] = useState<AdminTestResult[]>([]);
  const [proctorLogs, setProctorLogs] = useState<AdminProctorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "resumes" | "interviews" | "tests" | "proctoring">("overview");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [userRes, resumeRes, interviewRes, resultsRes, logsRes] = await Promise.all([
          adminAPI.getUserDetail(id),
          fetchResumeHistory(50),
          adminAPI.getInterviewSessions({ limit: 50, flagged: false }),
          adminAPI.getResults({ userId: id, limit: 20 }),
          adminAPI.getProctorLogs({ limit: 50, sessionId: "" }),
        ]);
        if (cancelled) return;
        setUser({
          _id: userRes.user._id,
          name: userRes.user.name,
          email: userRes.user.email,
          role: userRes.user.role,
          firebaseUid: userRes.user.firebaseUid,
          createdAt: userRes.user.createdAt
        });
        setResumes(resumeRes);
        setInterviews(interviewRes.sessions || []);
        setResults(resultsRes.results || []);
        setProctorLogs(logsRes.logs || []);
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 animate-spin border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <p className="text-center text-muted-foreground">User not found</p>
        </div>
      </DashboardLayout>
    );
  }

  const stats = {
    totalResumes: resumes.length,
    totalInterviews: interviews.length,
    totalTests: results.length,
    totalProctorLogs: proctorLogs.length,
    avgResumeScore: resumes.length ? Math.round(resumes.reduce((s, r) => s + r.overallScore, 0) / resumes.length) : 0,
    avgAccuracy: results.length ? Math.round(results.reduce((s, r) => s + (r.score / r.totalQuestions) * 100, 0) / results.length) : 0,
  };

  const formatDate = (d: string) => new Date(d).toLocaleString();

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/users">
              <ChevronLeft className="mr-2 w-4 h-4" />
              Back to Users
            </Link>
          </Button>
          <div className="flex-1" />
          <Badge variant={user.role === "admin" ? "destructive" : "outline"} className="text-xs">
            {user.role}
          </Badge>
        </div>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">
              {user.name?.charAt(0) || user.email?.charAt(0) || "U"}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{user.name || "Unnamed"}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="text-xs text-muted-foreground">Joined {formatDate(user.createdAt)}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border mb-6">
          <nav className="flex gap-1" role="tablist">
            {[
              { id: "overview", label: "Overview", icon: "📊" },
              { id: "resumes", label: `Resumes (${stats.totalResumes})`, icon: "📄" },
              { id: "interviews", label: `Interviews (${stats.totalInterviews})`, icon: "🎤" },
              { id: "tests", label: `Tests (${stats.totalTests})`, icon: "📝" },
              { id: "proctoring", label: `Proctoring (${stats.totalProctorLogs})`, icon: "🛡️" },
            ].map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id as UserDetailTab)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <span>{tab.icon}</span> {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <Card className="border border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Resumes</CardTitle>
                <CardDescription>Saved analyses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.totalResumes}</div>
              </CardContent>
            </Card>
            <Card className="border border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Interviews</CardTitle>
                <CardDescription>Mock interview sessions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.totalInterviews}</div>
              </CardContent>
            </Card>
            <Card className="border border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Resume Score</CardTitle>
                <CardDescription>Overall across all analyses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.avgResumeScore}%</div>
              </CardContent>
            </Card>
            <Card className="border border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Tests Taken</CardTitle>
                <CardDescription>Aptitude tests completed</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.totalTests}</div>
              </CardContent>
            </Card>
            <Card className="border border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Test Accuracy</CardTitle>
                <CardDescription>Across all tests</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.avgAccuracy}%</div>
              </CardContent>
            </Card>
            <Card className="border border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Proctor Logs</CardTitle>
                <CardDescription>Total events recorded</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.totalProctorLogs}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "resumes" && (
          <Card className="border border-border overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg">Resume Analyses</CardTitle>
              <CardDescription>All saved resume analyses for this user</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-4">Target Role</th>
                    <th className="pb-2 pr-4">Overall</th>
                    <th className="pb-2 pr-4">ATS</th>
                    <th className="pb-2 pr-4">Keywords</th>
                    <th className="pb-2 pr-4">Format</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {resumes.map((r) => (
                    <tr key={r._id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{r.targetRole}</p>
                        {r.label && <p className="text-xs text-muted-foreground">{r.label}</p>}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`font-semibold ${r.overallScore >= 70 ? "text-success" : r.overallScore >= 50 ? "text-warning" : "text-destructive"}`}>
                          {r.overallScore}/100
                        </span>
                      </td>
                      <td className="py-3 pr-4">{r.atsScore}</td>
                      <td className="py-3 pr-4">{r.keywordMatch}</td>
                      <td className="py-3 pr-4">{r.formatScore}</td>
                      <td className="py-3 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === "interviews" && (
          <Card className="border border-border overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg">Interview Sessions</CardTitle>
              <CardDescription>Mock interview sessions with integrity flags</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-4">Role</th>
                    <th className="pb-2 pr-4">Mode</th>
                    <th className="pb-2 pr-4">Duration</th>
                    <th className="pb-2 pr-4">Violations</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {interviews.map((s) => (
                    <tr key={s._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{s.role}</p>
                        <p className="text-xs text-muted-foreground">{s.experienceLevel}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className={`text-[10px] ${s.mode === "assessment" ? "border-destructive/40 text-destructive" : "border-success/40 text-success"}`}>
                          {s.mode}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          {Math.floor(s.durationSeconds / 60)}m {s.durationSeconds % 60}s
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${s.integrity?.terminated ? "text-destructive" : (s.integrity?.violations ?? 0) > 0 ? "text-warning" : "text-success"}`}>
                          {(s.integrity?.violations ?? 0)}/{s.integrity?.maxViolations ?? 3}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {s.integrity?.terminated ? (
                          <Badge variant="destructive" className="text-[10px]">TERMINATED</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-success border-success/40">Clean</Badge>
                        )}
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === "tests" && (
          <Card className="border border-border overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg">Test Results</CardTitle>
              <CardDescription>Aptitude test attempts</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-4">Score</th>
                    <th className="pb-2 pr-4">Total</th>
                    <th className="pb-2 pr-4">Mode</th>
                    <th className="pb-2 pr-4">Topic</th>
                    <th className="pb-2 pr-4">Difficulty</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-4 font-bold">{r.score}/{r.totalQuestions}</td>
                      <td className="py-3 pr-4">{r.totalQuestions}</td>
                      <td className="py-3 pr-4"><Badge variant="outline" className="text-[10px]">{r.mode}</Badge></td>
                      <td className="py-3 pr-4">{r.topic}</td>
                      <td className="py-3 pr-4">{r.difficulty || "—"}</td>
                      <td className="py-3 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === "proctoring" && (
          <Card className="border border-border overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg">Proctoring Events</CardTitle>
              <CardDescription>All proctoring events for this user</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-4">Event</th>
                    <th className="pb-2 pr-4">Session</th>
                    <th className="pb-2 pr-4">Time</th>
                    <th className="pb-2">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {proctorLogs.map((l) => (
                    <tr key={l.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-4">
                        <Badge variant="destructive" className="text-[10px]">{l.event.replace(/_/g, " ")}</Badge>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground truncate max-w-[200px]">{l.sessionId}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</td>
                      <td className="py-3 pr-4">
                        {l.hasSnapshot ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              adminAPI
                                .getProctorSnapshot(l.id)
                                .then(({ snapshot }) => window.open(snapshot, "_blank"))
                                .catch(() => toast.error("Could not load snapshot"))
                            }
                          >
                            <Video className="w-3.5 h-3.5 mr-1" /> View
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminUserDetail;