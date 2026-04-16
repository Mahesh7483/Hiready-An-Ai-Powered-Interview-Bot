import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Award, Target, Clock, Hash } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";

interface AnalyticsData {
  totalTests: number;
  avgScore: number;
  accuracy: number;
  avgTimePerQuestion: number;
  topicPerformance: { topic: string; correct: number; total: number; accuracy: number }[];
  progressOverTime: { date: string; score: number; total: number; mode: string }[];
  correctCount: number;
  wrongCount: number;
}

const COLORS = ["#10b981", "#ef4444", "#f59e0b"];

const AptitudeDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const userId = user?.uid || "anonymous";
        const response = await fetch(`http://localhost:5000/api/questions/analytics/${userId}`);
        const json = await response.json();
        setData(json);
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
        // Fallback: show empty state
        setData({
          totalTests: 0,
          avgScore: 0,
          accuracy: 0,
          avgTimePerQuestion: 0,
          topicPerformance: [],
          progressOverTime: [],
          correctCount: 0,
          wrongCount: 0,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [user?.uid]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!data) return null;

  const pieData = [
    { name: "Correct", value: data.correctCount },
    { name: "Wrong", value: data.wrongCount },
  ].filter((d) => d.value > 0);

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => navigate("/aptitude")}
          className="mb-6 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Aptitude
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Aptitude Dashboard</h1>
          <p className="text-muted-foreground">
            Track your progress and identify areas for improvement
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-2 border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
                  <Hash className="w-5 h-5 text-violet-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Tests</p>
                  <p className="text-2xl font-bold text-foreground">{data.totalTests}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Award className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Score</p>
                  <p className="text-2xl font-bold text-foreground">{data.avgScore.toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Target className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Accuracy</p>
                  <p className="text-2xl font-bold text-foreground">{data.accuracy.toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Time/Q</p>
                  <p className="text-2xl font-bold text-foreground">{data.avgTimePerQuestion.toFixed(0)}s</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {data.totalTests === 0 ? (
          <Card className="p-12 text-center border-2 border-dashed border-border">
            <p className="text-lg text-muted-foreground mb-4">
              No test data yet. Take a practice or test to see your analytics here.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => navigate("/aptitude/practice")} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                Start Practice
              </Button>
              <Button onClick={() => navigate("/aptitude/test")} className="bg-violet-600 hover:bg-violet-700 text-white">
                Take a Test
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart: Topic Performance */}
            {data.topicPerformance.length > 0 && (
              <Card className="border-2 border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Topic Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.topicPerformance}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="topic"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(v: string) => v.replace(/-/g, " ").slice(0, 12)}
                      />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, "Accuracy"]}
                        contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
                      />
                      <Bar dataKey="accuracy" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Line Chart: Score Over Time */}
            {data.progressOverTime.length > 0 && (
              <Card className="border-2 border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Score Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data.progressOverTime.map((p) => ({
                      ...p,
                      percentage: p.total > 0 ? Math.round((p.score / p.total) * 100) : 0,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, "Score"]}
                        contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="percentage"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ fill: "#10b981", r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Pie Chart: Correct vs Wrong */}
            {pieData.length > 0 && (
              <Card className="border-2 border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Correct vs Wrong</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, value }: { name: string; value: number }) => `${name}: ${value}`}
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AptitudeDashboard;
