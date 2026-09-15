import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight, Brain, TerminalSquare, MessageSquare, ClipboardList, FileUp, LayoutGrid,
} from "lucide-react";

// One tile per thing a student can choose to do. Records live inside each tile
// rather than in a separate section — "where I practise X" and "how I did at X"
// are the same place.
interface Tile {
  title: string;
  description: string;
  icon: typeof Brain;
  /** token name driving both the icon colour and its 10% tint */
  tone: "warning" | "primary" | "accent";
  to: string;
  cta: string;
  /** secondary links: this module's own history and stats */
  records?: Array<{ label: string; to: string }>;
  /** teal gradient instead of the primary one, matching Resume's existing CTA */
  accentCta?: boolean;
}

const tiles: Tile[] = [
  {
    title: "Aptitude",
    description: "Timed tests, topic drills & daily streaks",
    icon: Brain,
    tone: "warning",
    to: "/practice/aptitude",
    cta: "Take Test",
    records: [
      { label: "My Stats", to: "/practice/aptitude/stats" },
      { label: "Wrong Answers", to: "/mastery/review" },
      { label: "Leaderboard", to: "/practice/leaderboard" },
    ],
  },
  {
    title: "Technical Round",
    description: "Coding questions with run & submit feedback",
    icon: TerminalSquare,
    tone: "primary",
    to: "/practice/coding",
    cta: "Start Practice",
  },
  {
    title: "Mock Interview",
    description: "Strict AI interviewer with live proctoring",
    icon: MessageSquare,
    tone: "primary",
    to: "/practice/interview",
    cta: "Start Interview",
    records: [{ label: "Past sessions", to: "/practice/interview" }],
  },
  {
    title: "Assessments",
    description: "Proctored, multi-section evaluations",
    icon: ClipboardList,
    tone: "accent",
    to: "/practice/assessment",
    cta: "Take Assessment",
  },
  {
    title: "Resume",
    description: "ATS scoring, keyword gaps & AI rewrites",
    icon: FileUp,
    tone: "accent",
    to: "/practice/resume",
    cta: "New Analysis",
    accentCta: true,
    records: [{ label: "My Resumes", to: "/practice/resume/library" }],
  },
];

const toneClasses: Record<Tile["tone"], { tint: string; ink: string }> = {
  warning: { tint: "bg-warning/10", ink: "text-warning" },
  primary: { tint: "bg-primary/10", ink: "text-primary" },
  accent: { tint: "bg-accent/10", ink: "text-accent" },
};

const Practice = () => (
  <DashboardLayout>
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Practice</h1>
        <p className="text-muted-foreground">
          Pick what you want to work on. For a session chosen for you, head to Mastery.
        </p>
      </div>

      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
        <LayoutGrid className="w-4 h-4" /> Everything you can practise
      </h2>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const tone = toneClasses[tile.tone];
          return (
            <Card
              key={tile.title}
              className="border border-border shadow-md hover:shadow-lg transition-shadow flex flex-col"
            >
              <CardHeader className="flex-1">
                <div className={`w-12 h-12 rounded-lg ${tone.tint} flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${tone.ink}`} />
                </div>
                <CardTitle>{tile.title}</CardTitle>
                <CardDescription>{tile.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Link to={tile.to} className="block">
                  <Button
                    className={`w-full ${
                      tile.accentCta ? "bg-gradient-accent" : "bg-gradient-primary"
                    } hover:opacity-90 transition-opacity`}
                  >
                    {tile.cta} <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
                {tile.records && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
                    {tile.records.map((r) => (
                      <Link
                        key={r.label}
                        to={r.to}
                        className="hover:text-foreground underline-offset-2 hover:underline"
                      >
                        {r.label}
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  </DashboardLayout>
);

export default Practice;
