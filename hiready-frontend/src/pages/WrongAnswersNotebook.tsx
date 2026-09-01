import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, NotebookPen, CheckCircle2, XCircle, RefreshCw, Bookmark, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { apiJson } from "@/lib/api";

interface WrongAnswerItem {
  questionId: string;
  question: string;
  options: Record<string, string>;
  correctAnswer: string;
  explanation?: string;
  topic: string;
  difficulty: string;
  yourAnswer: string;
  timesWrong: number;
  lastWrongAt: string;
}

interface SavedQuestionItem {
  questionId: string;
  Question: string;
  "Option A": string;
  "Option B": string;
  "Option C": string;
  "Option D": string;
  Answer: string;
  Explanation: string;
  category: string;
  difficulty: string | null;
  savedAt: string;
}

const LETTERS = ["A", "B", "C", "D"];

const WrongAnswersNotebook = () => {
  const [tab, setTab] = useState<"wrong" | "saved">("wrong");
  const [items, setItems] = useState<WrongAnswerItem[] | null>(null);
  const [savedItems, setSavedItems] = useState<SavedQuestionItem[] | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const data = await apiJson<{ items: WrongAnswerItem[] }>("/questions/wrong-answers/me");
        setItems(data.items ?? []);
      } catch {
        toast.error("Failed to load your notebook");
        setItems([]);
      }
    })();
  }, []);

  const loadSaved = useCallback(async () => {
    try {
      const data = await apiJson<{ items: SavedQuestionItem[] }>("/questions/bookmarks/me");
      setSavedItems(data.items ?? []);
    } catch {
      toast.error("Failed to load saved questions");
      setSavedItems([]);
    }
  }, []);

  // Saved questions are fetched lazily, the first time the tab opens
  useEffect(() => {
    if (tab === "saved" && savedItems === null) loadSaved();
  }, [tab, savedItems, loadSaved]);

  const removeBookmark = async (questionId: string) => {
    setSavedItems((prev) => (prev ? prev.filter((i) => i.questionId !== questionId) : prev));
    try {
      await apiJson(`/questions/bookmarks/${questionId}`, { method: "DELETE" });
      toast.success("Removed from saved questions");
    } catch {
      toast.error("Could not remove bookmark");
      loadSaved();
    }
  };

  const reveal = (id: string) =>
    setRevealed((prev) => new Set(prev).add(id));

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <NotebookPen className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Notebook</h1>
            <p className="text-sm text-muted-foreground">
              Review wrong answers and your saved questions
            </p>
          </div>
        </div>

        {/* Tabs: Wrong Answers / Saved Questions */}
        <div className="flex gap-2 p-1 rounded-lg bg-muted/60 w-fit my-6">
          <button
            onClick={() => setTab("wrong")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              tab === "wrong" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <XCircle className="w-4 h-4" /> Wrong Answers
          </button>
          <button
            onClick={() => setTab("saved")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              tab === "saved" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bookmark className="w-4 h-4" /> Saved Questions
          </button>
        </div>

        <div className="flex items-center justify-between my-6">
          <p className="text-sm text-muted-foreground px-1">
            {tab === "wrong"
              ? items
                ? `${items.length} question${items.length === 1 ? "" : "s"} to master`
                : ""
              : savedItems
              ? `${savedItems.length} question${savedItems.length === 1 ? "" : "s"} saved`
              : ""}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/aptitude/practice">
              <RefreshCw className="mr-2 w-4 h-4" /> Practice these topics
            </Link>
          </Button>
        </div>

        {tab === "wrong" && (items === null ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-2">
              <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
              <p className="font-medium">Nothing here — you haven't answered anything wrong yet!</p>
              <p className="text-sm text-muted-foreground">Keep practicing to find your weak spots.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const isRevealed = revealed.has(item.questionId);
              return (
                <Card key={item.questionId} className="border border-border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{item.question}</p>
                    {item.timesWrong > 1 && (
                      <Badge variant="outline" className="shrink-0 text-[10px] border-warning/40 text-warning">
                        wrong ×{item.timesWrong}
                      </Badge>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2">
                    {LETTERS.map((letter) => {
                      const isCorrect = item.correctAnswer === letter;
                      const isYours = item.yourAnswer === letter;
                      const showState = isRevealed && (isCorrect || isYours);
                      return (
                        <div
                          key={letter}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${
                            showState && isCorrect
                              ? "border-success/50 bg-success/5"
                              : showState && isYours
                              ? "border-destructive/50 bg-destructive/5"
                              : "border-border bg-muted/20"
                          }`}
                        >
                          <span className="w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center text-xs font-semibold shrink-0">
                            {letter}
                          </span>
                          <span className="min-w-0 truncate">{item.options[letter]}</span>
                          {showState && isCorrect && <CheckCircle2 className="w-4 h-4 text-success ml-auto shrink-0" />}
                          {showState && isYours && !isCorrect && <XCircle className="w-4 h-4 text-destructive ml-auto shrink-0" />}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-[10px]">{item.topic}</Badge>
                      {item.difficulty && <Badge variant="outline" className="text-[10px]">{item.difficulty}</Badge>}
                    </div>
                    {!isRevealed && (
                      <Button variant="outline" size="sm" onClick={() => reveal(item.questionId)}>
                        Reveal answer
                      </Button>
                    )}
                  </div>

                  {isRevealed && item.explanation && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Explanation</p>
                      <p className="text-sm text-muted-foreground">{item.explanation}</p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ))}

        {tab === "saved" && (savedItems === null ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : savedItems.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-2">
              <Bookmark className="w-12 h-12 text-muted-foreground mx-auto" />
              <p className="font-medium">No saved questions yet.</p>
              <p className="text-sm text-muted-foreground">
                Tap "Save" during a test or practice session to bookmark questions here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {savedItems.map((item) => {
              const isRevealed = revealed.has(item.questionId);
              return (
                <Card key={item.questionId} className="border border-border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{item.Question}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeBookmark(item.questionId)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2">
                    {LETTERS.map((letter) => {
                      const isCorrect = item.Answer === letter;
                      const showState = isRevealed && isCorrect;
                      return (
                        <div
                          key={letter}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${
                            showState
                              ? "border-success/50 bg-success/5"
                              : "border-border bg-muted/20"
                          }`}
                        >
                          <span className="w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center text-xs font-semibold shrink-0">
                            {letter}
                          </span>
                          < span className="min-w-0 truncate">{item[`Option ${letter}` as keyof typeof item]}</span>
                          {showState && <CheckCircle2 className="w-4 h-4 text-success ml-auto shrink-0" />}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                      {item.difficulty && <Badge variant="outline" className="text-[10px]">{item.difficulty}</Badge>}
                    </div>
                    {!isRevealed && (
                      <Button variant="outline" size="sm" onClick={() => reveal(item.questionId)}>
                        Reveal answer
                      </Button>
                    )}
                  </div>

                  {isRevealed && item.Explanation && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Explanation</p>
                      <p className="text-sm text-muted-foreground">{item.Explanation}</p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
};

export default WrongAnswersNotebook;
