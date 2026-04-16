import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ShieldCheck, Zap, Brain, Clock } from "lucide-react";
import AptitudeTest from "./AptitudeTest";

interface TestType {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  questionCount: number;
  timerMinutes: number;
  topic: string;
}

const testTypes: TestType[] = [
  {
    id: "mock",
    title: "Full Mock Test",
    description: "Simulates a real placement aptitude test with mixed questions across all topics.",
    icon: <ShieldCheck className="w-6 h-6" />,
    questionCount: 20,
    timerMinutes: 30,
    topic: "logical",
  },
  {
    id: "topic",
    title: "Topic-wise Test",
    description: "Focus on a specific topic to strengthen your weak areas.",
    icon: <Brain className="w-6 h-6" />,
    questionCount: 10,
    timerMinutes: 15,
    topic: "logical",
  },
  {
    id: "quick",
    title: "Quick Test",
    description: "A short 5-question sprint to test yourself in under 5 minutes.",
    icon: <Zap className="w-6 h-6" />,
    questionCount: 5,
    timerMinutes: 5,
    topic: "logical",
  },
];

const topicOptions = [
  { value: "logical", label: "Logical Reasoning" },
  { value: "coding-theory", label: "Coding Theory" },
  { value: "blood-relation", label: "Blood Relations" },
  { value: "number-series", label: "Number Series" },
  { value: "quantitative-aptitude", label: "Quantitative Aptitude" },
  { value: "puzzles", label: "Puzzles" },
];

const AptitudeTestPage = () => {
  const navigate = useNavigate();
  const [started, setStarted] = useState(false);
  const [selectedType, setSelectedType] = useState<TestType>(testTypes[0]);
  const [selectedTopic, setSelectedTopic] = useState("logical");

  if (started) {
    return (
      <AptitudeTest
        mode="test"
        topic={selectedType.id === "topic" ? selectedTopic : selectedType.topic}
        questionCount={selectedType.questionCount}
        timerMinutes={selectedType.timerMinutes}
      />
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
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
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-violet-500" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Proctored Test</h1>
          </div>
          <p className="text-muted-foreground">
            Choose your test type. Webcam proctoring will be active throughout.
          </p>
        </div>

        <div className="space-y-6">
          {/* Test Type Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {testTypes.map((t) => (
              <Card
                key={t.id}
                className={`cursor-pointer border-2 transition-all hover:shadow-md ${
                  selectedType.id === t.id
                    ? "border-violet-500 bg-violet-500/5"
                    : "border-border hover:border-violet-300"
                }`}
                onClick={() => setSelectedType(t)}
              >
                <CardHeader className="pb-2">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${selectedType.id === t.id ? "bg-violet-500 text-white" : "bg-violet-500/10 text-violet-500"}`}>
                    {t.icon}
                  </div>
                  <CardTitle className="text-lg">{t.title}</CardTitle>
                  <CardDescription className="text-xs">{t.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Brain className="w-3 h-3" /> {t.questionCount} Qs
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {t.timerMinutes} min
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Topic selection for topic-wise test */}
          {selectedType.id === "topic" && (
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Select Topic</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {topicOptions.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setSelectedTopic(t.value)}
                      className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        selectedTopic === t.value
                          ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-400"
                          : "border-border hover:border-violet-300 text-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Instructions */}
          <Card className="border border-border bg-violet-50/50 dark:bg-violet-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-violet-700 dark:text-violet-400">Before you begin</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                  Ensure your webcam is working — proctoring will start immediately.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                  Do not switch tabs or leave the browser window during the test.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                  Multiple-person detection is active — sit alone in a quiet space.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                  The test will auto-submit when the timer runs out.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                  Warnings will be recorded and shown in your results.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Start Button */}
          <Button
            onClick={() => setStarted(true)}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-6 text-lg"
          >
            Start {selectedType.title}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AptitudeTestPage;
