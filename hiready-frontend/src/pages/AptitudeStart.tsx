import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  BarChart3, BookOpen, Camera, Clock, NotebookPen, Play, ShieldAlert, Trophy,
} from "lucide-react";

import {
  DEFAULT_CONFIG, DIFFICULTIES, QUESTION_COUNTS, TEST_PRESETS, TOPICS,
  type AptitudeConfig, type AptitudeMode,
} from "@/lib/aptitude";

/**
 * One screen to start an aptitude session.
 *
 * It replaces three: AptitudePlayCards (a card menu), AptitudePractice and
 * AptitudeTestPage (two near-identical configurators offering overlapping
 * subsets of the same options). The test configurator was unreachable — the
 * "Test" card pointed straight at the runner, so a timed test always ran with
 * hardcoded defaults and none of its settings could be chosen at all.
 *
 * Config travels to the runner in navigation state rather than through three
 * layers of props, so /practice/aptitude/run has exactly one caller.
 */
const AptitudeStart = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<AptitudeConfig>(DEFAULT_CONFIG);
  const set = <K extends keyof AptitudeConfig>(key: K, value: AptitudeConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const isTest = config.mode === "test";

  const applyPreset = (id: string) => {
    const preset = TEST_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setConfig((prev) => ({
      ...prev,
      topic: preset.topic,
      questionCount: preset.questionCount,
      timerMinutes: preset.timerMinutes,
      timerEnabled: true,
    }));
  };

  const start = () => navigate("/practice/aptitude/run", { state: { config } });

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Aptitude</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Practise freely, or sit a timed test under exam conditions.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_300px] items-start">
          <div className="space-y-6">
            {/* Mode — the one choice that changes everything else */}
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Mode</CardTitle>
                <CardDescription>
                  This is declared to the server, not just to the screen.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {([
                  {
                    id: "practice" as AptitudeMode,
                    icon: BookOpen,
                    title: "Practice",
                    body: "See the correct answer and an explanation after each question. No webcam, no countdown unless you want one.",
                  },
                  {
                    id: "test" as AptitudeMode,
                    icon: ShieldAlert,
                    title: "Timed test",
                    body: "Proctored and timed. Answers are never revealed mid-test — the server refuses. Graded at the end.",
                  },
                ]).map((opt) => {
                  const Icon = opt.icon;
                  const selected = config.mode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => set("mode", opt.id)}
                      className={`text-left rounded-lg border p-4 transition-colors ${
                        selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Icon className="w-4 h-4 text-primary" /> {opt.title}
                      </span>
                      <span className="block text-xs text-muted-foreground mt-1.5">{opt.body}</span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {isTest && (
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Start from a preset</CardTitle>
                  <CardDescription>Optional — everything stays editable below.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  {TEST_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      className="text-left rounded-lg border border-border p-3 hover:border-primary/40 hover:bg-muted/50 transition-colors"
                    >
                      <span className="block text-sm font-medium text-foreground">{p.title}</span>
                      <span className="block text-xs text-muted-foreground mt-1">{p.description}</span>
                      <span className="block text-[11px] text-muted-foreground mt-2">
                        {p.questionCount} questions · {p.timerMinutes} min
                      </span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="border border-border">
              <CardHeader className="pb-3"><CardTitle className="text-base">Questions</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="apt-topic">Topic</Label>
                    <Select value={config.topic} onValueChange={(v) => set("topic", v)}>
                      <SelectTrigger id="apt-topic"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TOPICS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apt-count">How many</Label>
                    <Select
                      value={String(config.questionCount)}
                      onValueChange={(v) => set("questionCount", Number(v))}
                    >
                      <SelectTrigger id="apt-count"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {QUESTION_COUNTS.map((n) => (
                          <SelectItem key={n} value={String(n)}>{n} questions</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <div className="flex flex-wrap gap-2">
                    {DIFFICULTIES.map((d) => {
                      const selected = config.difficulty === d.value;
                      return (
                        <button
                          key={d.value || "any"}
                          type="button"
                          onClick={() => set("difficulty", d.value)}
                          disabled={config.adaptive}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                            selected ? d.cls : "border-border text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  {config.adaptive && (
                    <p className="text-xs text-muted-foreground">
                      Adaptive mode picks the difficulty from your recent accuracy, so this is ignored.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardHeader className="pb-3"><CardTitle className="text-base">Rules</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-start justify-between gap-4 cursor-pointer">
                  <span>
                    <span className="block text-sm font-medium text-foreground">Timer</span>
                    <span className="block text-xs text-muted-foreground">
                      {isTest
                        ? "Always on for a timed test."
                        : "Optional in practice — useful for building exam pace."}
                    </span>
                  </span>
                  <Switch
                    checked={isTest || config.timerEnabled}
                    disabled={isTest}
                    onCheckedChange={(v) => set("timerEnabled", v)}
                  />
                </label>

                {(isTest || config.timerEnabled) && (
                  <div className="space-y-2 pl-1">
                    <Label htmlFor="apt-minutes">Minutes</Label>
                    <Select
                      value={String(config.timerMinutes)}
                      onValueChange={(v) => set("timerMinutes", Number(v))}
                    >
                      <SelectTrigger id="apt-minutes" className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                          <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <label className="flex items-start justify-between gap-4 cursor-pointer">
                  <span>
                    <span className="block text-sm font-medium text-foreground">Negative marking</span>
                    <span className="block text-xs text-muted-foreground">
                      Lose 0.25 for a wrong answer. Leaving a question blank never costs anything.
                    </span>
                  </span>
                  <Switch
                    checked={config.negativeMarking}
                    onCheckedChange={(v) => set("negativeMarking", v)}
                  />
                </label>

                <label className="flex items-start justify-between gap-4 cursor-pointer">
                  <span>
                    <span className="block text-sm font-medium text-foreground">Adaptive difficulty</span>
                    <span className="block text-xs text-muted-foreground">
                      The server picks the level from your recent accuracy and adjusts as you go.
                    </span>
                  </span>
                  <Switch checked={config.adaptive} onCheckedChange={(v) => set("adaptive", v)} />
                </label>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 lg:sticky lg:top-6">
            <Card className="border border-border">
              <CardHeader className="pb-3"><CardTitle className="text-base">Your session</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={isTest
                    ? "bg-destructive/10 text-destructive border-destructive/20"
                    : "bg-success/10 text-success border-success/20"}>
                    {isTest ? "Timed test" : "Practice"}
                  </Badge>
                  <Badge variant="secondary">{config.questionCount} questions</Badge>
                  {(isTest || config.timerEnabled) && (
                    <Badge variant="secondary">
                      <Clock className="w-3 h-3 mr-1" />{config.timerMinutes} min
                    </Badge>
                  )}
                  {config.negativeMarking && <Badge variant="secondary">−0.25 wrong</Badge>}
                  {config.adaptive && <Badge variant="secondary">Adaptive</Badge>}
                </div>

                {isTest && (
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Camera className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    Your webcam is used to check one person is present. Leaving the tab or
                    exiting fullscreen is recorded. Answers are not shown until you submit.
                  </p>
                )}

                <Button className="w-full bg-gradient-primary hover:opacity-90" onClick={start}>
                  <Play className="w-4 h-4 mr-1.5" />
                  {isTest ? "Start test" : "Start practice"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardContent className="pt-6 space-y-1">
                {[
                  { to: "/practice/aptitude/stats", icon: BarChart3, label: "Your statistics" },
                  { to: "/mastery/review", icon: NotebookPen, label: "Questions you got wrong" },
                  { to: "/practice/leaderboard", icon: Trophy, label: "Leaderboard" },
                ].map((l) => {
                  const Icon = l.icon;
                  return (
                    <Link
                      key={l.to}
                      to={l.to}
                      className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    >
                      <Icon className="w-4 h-4" /> {l.label}
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AptitudeStart;
