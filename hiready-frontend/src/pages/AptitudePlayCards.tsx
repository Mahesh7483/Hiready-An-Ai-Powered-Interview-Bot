import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, BookOpen, ShieldCheck, BarChart3, NotebookPen, Trophy } from "lucide-react";

interface SectionCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
  path: string;
  features: string[];
}

const AptitudePlayCards = () => {
  const navigate = useNavigate();

  const sections: SectionCard[] = [
    {
      id: "practice",
      title: "Practice",
      description: "Sharpen your skills with unlimited practice sessions — no webcam, no pressure.",
      icon: <BookOpen className="w-7 h-7" />,
      gradient: "from-emerald-500 to-teal-600",
      iconBg: "bg-emerald-500/10 text-emerald-500",
      path: "/aptitude/practice",
      features: [
        "No proctoring or webcam",
        "Choose topic & difficulty",
        "View explanations after each answer",
        "Add more questions on the fly",
      ],
    },
    {
      id: "test",
      title: "Test",
      description: "Take a proctored, timed test that simulates real placement aptitude rounds.",
      icon: <ShieldCheck className="w-7 h-7" />,
      gradient: "from-violet-500 to-purple-600",
      iconBg: "bg-violet-500/10 text-violet-500",
      path: "/aptitude/test",
      features: [
        "Full proctoring (webcam + face detection)",
        "Strict timer enforcement",
        "Tab-switch & multi-person detection",
        "Warning system with auto-submit",
      ],
    },
    {
      id: "dashboard",
      title: "Dashboard",
      description: "Visualize your progress with detailed analytics, charts, and topic breakdowns.",
      icon: <BarChart3 className="w-7 h-7" />,
      gradient: "from-amber-500 to-orange-600",
      iconBg: "bg-amber-500/10 text-amber-500",
      path: "/aptitude/dashboard",
      features: [
        "Score trends over time",
        "Topic-wise performance",
        "Accuracy & speed metrics",
        "Practice vs. test comparison",
      ],
    },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">Aptitude Platform</h1>
          <p className="text-muted-foreground text-lg">
            Practice, test, and track your aptitude preparation journey
          </p>
        </div>

        {/* Section Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {sections.map((section) => (
            <Card
              key={section.id}
              className="border border-border shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col cursor-pointer group overflow-hidden"
              onClick={() => navigate(section.path)}
            >
              {/* Gradient top bar */}
              <div className={`h-1.5 bg-gradient-to-r ${section.gradient}`} />

              <CardHeader className="flex-1 pb-4">
                <div
                  className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 ${section.iconBg} group-hover:scale-110 transition-transform`}
                >
                  {section.icon}
                </div>
                <CardTitle className="text-2xl mb-2">{section.title}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  {section.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-0 space-y-4">
                <ul className="space-y-2">
                  {section.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full text-white bg-gradient-to-r ${section.gradient} hover:opacity-90 transition-opacity`}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(section.path);
                  }}
                >
                  Open {section.title}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Extra tools row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8 max-w-2xl mx-auto">
          <Card
            className="border border-border shadow-md hover:shadow-lg transition-all cursor-pointer group"
            onClick={() => navigate("/aptitude/notebook")}
          >
            <CardHeader className="pb-2">
              <div className="w-11 h-11 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <NotebookPen className="w-5 h-5" />
              </div>
              <CardTitle className="text-lg">Wrong-Answer Notebook</CardTitle>
              <CardDescription className="text-xs">
                Every question you got wrong, with answers — master your weak spots
              </CardDescription>
            </CardHeader>
          </Card>
          <Card
            className="border border-border shadow-md hover:shadow-lg transition-all cursor-pointer group"
            onClick={() => navigate("/leaderboard")}
          >
            <CardHeader className="pb-2">
              <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Trophy className="w-5 h-5" />
              </div>
              <CardTitle className="text-lg">Leaderboard</CardTitle>
              <CardDescription className="text-xs">
                Weekly and all-time rankings — climb the ladder
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AptitudePlayCards;
