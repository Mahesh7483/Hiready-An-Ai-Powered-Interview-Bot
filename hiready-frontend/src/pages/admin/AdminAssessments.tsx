import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Users, ClipboardList, X } from "lucide-react";
import { toast } from "sonner";
import { assessmentAPI, type TemplateDTO } from "@/lib/assessmentApi";

interface SectionDraft {
  type: "aptitude" | "coding" | "voice-interview";
  title: string;
  minutes: number;
  topic?: string;
  count?: number;
  negativeMarking?: boolean;
  codingCount?: number;
  codingDifficulty?: string;
  interviewDurationMin?: number;
}

const emptySection = (): SectionDraft => ({
  type: "aptitude",
  title: "",
  minutes: 10,
  topic: "",
  count: 10,
  negativeMarking: true,
});

const AdminAssessments = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateDTO[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Builder form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [sections, setSections] = useState<SectionDraft[]>([emptySection()]);
  const [attemptLimit, setAttemptLimit] = useState(1);
  const [cooldownDays, setCooldownDays] = useState(0);
  const [violationThreshold, setViolationThreshold] = useState(100);
  const [resumeDriven, setResumeDriven] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);

  const load = async () => {
    try {
      const data = await assessmentAPI.getTemplates();
      setTemplates(data.templates);
    } catch {
      toast.error("Failed to load assessments");
      setTemplates([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateSection = (i: number, patch: Partial<SectionDraft>) => {
    setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, ...patch } : sec)));
  };

  const createTemplate = async () => {
    if (!title.trim()) return toast.error("Title is required");
    const cleanSections = sections.map((s) => ({
      type: s.type,
      title: s.title.trim() || s.type,
      minutes: Number(s.minutes) || 10,
      ...(s.type === "aptitude"
        ? { topic: s.topic || "", count: Number(s.count) || 10, negativeMarking: s.negativeMarking !== false }
        : {}),
      ...(s.type === "coding"
        ? { codingCount: Number(s.codingCount) || 2, codingDifficulty: s.codingDifficulty || "" }
        : {}),
      ...(s.type === "voice-interview"
        ? { interviewDurationMin: Number(s.interviewDurationMin) || 10 }
        : {}),
    }));
    setLoading(true);
    try {
      await assessmentAPI.createTemplate({
        title: title.trim(),
        description,
        targetRole,
        sections: cleanSections,
        breaks: [],
        resumeDriven,
        attemptLimit: Number(attemptLimit) || 1,
        cooldownDays: Number(cooldownDays) || 0,
        violationThreshold: Number(violationThreshold) || 100,
      });
      toast.success("Assessment template created");
      setShowBuilder(false);
      setTitle("");
      setDescription("");
      setTargetRole("");
      setSections([emptySection()]);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create assessment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="w-6 h-6" /> Assessments
            </h1>
            <p className="text-muted-foreground mt-1">
              Build unified technical assessments: aptitude + coding + voice interview.
            </p>
          </div>
          <Button onClick={() => setShowBuilder((v) => !v)}>
            {showBuilder ? <X className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            {showBuilder ? "Cancel" : "New assessment"}
          </Button>
        </div>

        {showBuilder && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Create Assessment Template</CardTitle>
              <CardDescription>
                Sections run in order; the candidate gets a scheduled break between them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  placeholder="Title * (e.g. Full Stack Fresher — Unified Round)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <Input
                  placeholder="Target role (e.g. SDE-1, Data Analyst)"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                />
              </div>
              <Textarea
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />

              <div className="space-y-3">

                  {sections.map((s, i) => (
                    <div key={i} className="border border-border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">Section {i + 1}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSections((all) => all.filter((_, idx) => idx !== i))}
                          disabled={sections.length <= 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="grid md:grid-cols-3 gap-3">
                        <Select
                          value={s.type}
                          onValueChange={(v) => updateSection(i, { type: v as SectionDraft["type"] })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="aptitude">Aptitude MCQ</SelectItem>
                            <SelectItem value="coding">Coding</SelectItem>
                            <SelectItem value="voice-interview">Voice Interview</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Section title"
                          value={s.title}
                          onChange={(e) => updateSection(i, { title: e.target.value })}
                        />
                        <Input
                          type="number"
                          min={1}
                          placeholder="Minutes"
                          value={s.minutes}
                          onChange={(e) => updateSection(i, { minutes: Number(e.target.value) })}
                        />
                      </div>
                      {s.type === "aptitude" && (
                        <div className="grid md:grid-cols-3 gap-3">
                          <Input
                            placeholder="Topic (e.g. Quantitative Aptitude)"
                            value={s.topic || ""}
                            onChange={(e) => updateSection(i, { topic: e.target.value })}
                          />
                          <Input
                            type="number"
                            min={1}
                            max={50}
                            placeholder="Question count"
                            value={s.count || 10}
                            onChange={(e) => updateSection(i, { count: Number(e.target.value) })}
                          />
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={s.negativeMarking !== false}
                              onChange={(e) => updateSection(i, { negativeMarking: e.target.checked })}
                            />
                            Negative marking (-0.25)
                          </label>
                        </div>
                      )}
                      {s.type === "coding" && (
                        <div className="grid md:grid-cols-2 gap-3">
                          <Input
                            type="number"
                            min={1}
                            max={5}
                            placeholder="Problems count"
                            value={s.codingCount || 2}
                            onChange={(e) => updateSection(i, { codingCount: Number(e.target.value) })}
                          />
                          <Select
                            value={s.codingDifficulty || ""}
                            onValueChange={(v) => updateSection(i, { codingDifficulty: v })}
                          >
                            <SelectTrigger><SelectValue placeholder="Difficulty (any)" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">Any</SelectItem>
                              <SelectItem value="easy">Easy</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="hard">Hard</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {s.type === "voice-interview" && (
                        <Input
                          type="number"
                          min={1}
                          max={60}
                          placeholder="Interview duration (min)"
                          value={s.interviewDurationMin || 10}
                          onChange={(e) => updateSection(i, { interviewDurationMin: Number(e.target.value) })}
                        />
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setSections((all) => [...all, emptySection()])}>
                    <Plus className="w-4 h-4 mr-1" /> Add section
                  </Button>
                </div>

                <div className="grid md:grid-cols-4 gap-3">
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    placeholder="Attempt limit"
                    value={attemptLimit}
                    onChange={(e) => setAttemptLimit(Number(e.target.value))}
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="Cooldown (days)"
                    value={cooldownDays}
                    onChange={(e) => setCooldownDays(Number(e.target.value))}
                  />
                  <Input
                    type="number"
                    min={10}
                    placeholder="Violation threshold"
                    value={violationThreshold}
                    onChange={(e) => setViolationThreshold(Number(e.target.value))}
                  />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={resumeDriven}
                      onChange={(e) => setResumeDriven(e.target.checked)}
                    />
                    Resume-personalized
                  </label>
                </div>

                <Button onClick={createTemplate} disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Create template
                </Button>
              </CardContent>
            </Card>
        )}

        <div className="space-y-4">
          {templates === null ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2" />
                No assessment templates yet — create the first one above.
              </CardContent>
            </Card>
          ) : (
            templates.map((t) => (
              <Card key={t._id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{t.title}</CardTitle>
                      <CardDescription>
                        {t.targetRole || "General"} · {t.attemptLimit} attempt(s)
                      </CardDescription>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {t.sections.map((s, i) => (
                        <Badge key={i} variant="outline">{s.type}</Badge>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {(t.sections || []).reduce((sum, s) => sum + (s.minutes || 0), 0)} min total
                    {t.resumeDriven && " · Resume-personalized"}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => navigate("/admin/assessments")} disabled>
                    View results
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminAssessments;

