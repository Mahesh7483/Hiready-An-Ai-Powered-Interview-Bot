import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, BookOpen, Clock, Hash } from "lucide-react";
import AptitudeTest from "./AptitudeTest";

const topics = [
  { value: "logical", label: "Logical Reasoning" },
  { value: "coding-theory", label: "Coding Theory" },
  { value: "blood-relation", label: "Blood Relations" },
  { value: "number-series", label: "Number Series" },
  { value: "quantitative-aptitude", label: "Quantitative Aptitude" },
  { value: "puzzles", label: "Puzzles" },
];

const difficulties = [
  { value: "easy", label: "Easy", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  { value: "medium", label: "Medium", color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "hard", label: "Hard", color: "text-red-600 bg-red-50 border-red-200" },
];

const questionCounts = [5, 10, 15, 20];

const AptitudePractice = () => {
  const navigate = useNavigate();
  const [started, setStarted] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState("logical");
  const [selectedDifficulty, setSelectedDifficulty] = useState("medium");
  const [selectedCount, setSelectedCount] = useState(10);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(15);

  if (started) {
    return (
      <AptitudeTest
        mode="practice"
        topic={selectedTopic}
        difficulty={selectedDifficulty}
        questionCount={selectedCount}
        timerEnabled={timerEnabled}
        timerMinutes={timerMinutes}
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
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-emerald-500" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Practice Setup</h1>
          </div>
          <p className="text-muted-foreground">
            Customize your practice session — no proctoring, no pressure.
          </p>
        </div>

        <div className="space-y-6">
          {/* Topic Selection */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Select Topic</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {topics.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setSelectedTopic(t.value)}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      selectedTopic === t.value
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-border hover:border-emerald-300 text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Difficulty Selection */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Difficulty Level</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {difficulties.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setSelectedDifficulty(d.value)}
                    className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      selectedDifficulty === d.value
                        ? `${d.color} border-current`
                        : "border-border hover:border-muted-foreground text-foreground"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Number of Questions */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Hash className="w-4 h-4" /> Number of Questions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {questionCounts.map((c) => (
                  <button
                    key={c}
                    onClick={() => setSelectedCount(c)}
                    className={`flex-1 p-3 rounded-lg border-2 text-sm font-bold transition-all ${
                      selectedCount === c
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-border hover:border-emerald-300 text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Timer toggle */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-4 h-4" /> Timer (Optional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setTimerEnabled(!timerEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    timerEnabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      timerEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm text-muted-foreground">
                  {timerEnabled ? "Timer enabled" : "No timer"}
                </span>
                {timerEnabled && (
                  <div className="flex items-center gap-2 ml-4">
                    {[10, 15, 20, 30].map((m) => (
                      <Badge
                        key={m}
                        variant={timerMinutes === m ? "default" : "outline"}
                        className={`cursor-pointer ${timerMinutes === m ? "bg-emerald-500 text-white" : ""}`}
                        onClick={() => setTimerMinutes(m)}
                      >
                        {m} min
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Start Button */}
          <Button
            onClick={() => setStarted(true)}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-6 text-lg"
          >
            Start Practice
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AptitudePractice;
