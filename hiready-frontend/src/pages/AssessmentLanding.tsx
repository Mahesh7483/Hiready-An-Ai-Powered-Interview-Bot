import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardList, Clock, Users, Code, Mic, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { assessmentAPI, type TemplateDTO } from "@/lib/assessmentApi";

const SECTION_ICONS: Record<string, React.ReactNode> = {
  aptitude: <ClipboardList className="w-4 h-4" />,
  coding: <Code className="w-4 h-4" />,
  "voice-interview": <Mic className="w-4 h-4" />,
};

const AssessmentLanding = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateDTO[] | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await assessmentAPI.getTemplates();
        if (!cancelled) setTemplates(data.templates);
      } catch {
        if (!cancelled) {
          toast.error("Failed to load assessments");
          setTemplates([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startTemplate = async (templateId: string) => {
    setStartingId(templateId);
    try {
      await assessmentAPI.start(templateId);
      navigate("/assessments/take");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start assessment");
      setStartingId(null);
    }
  };

  const totalMinutes = (t: TemplateDTO) => t.sections.reduce((s, x) => s + (x.minutes || 0), 0) + (t.breaks || []).reduce((s, b) => s + b.minutes, 0);

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Assessments</h1>
        </div>
        <p className="text-muted-foreground mb-8">
          Unified technical assessments: aptitude, coding, and a live voice interview — proctored, with scheduled breaks.
        </p>

        {templates === null ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No assessments published yet. Check back soon.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {templates.map((t) => (
              <Card key={t._id} className="hover:border-primary/40 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{t.title}</CardTitle>
                      <CardDescription className="mt-1">{t.description || `For ${t.targetRole || "all roles"}`}</CardDescription>
                    </div>
                    {t.resumeDriven && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">Resume-personalized</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {t.sections.map((s, i) => (
                      <Badge key={i} variant="outline" className="gap-1.5">
                        {SECTION_ICONS[s.type]}
                        {s.title || s.type} · {s.minutes}m
                      </Badge>
                    ))}
                    {(t.breaks || []).map((b, i) => (
                      <Badge key={`b${i}`} variant="secondary" className="gap-1.5">
                        ☕ {b.minutes}m break
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> ~{totalMinutes(t)} min total</span>
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {t.attemptLimit} attempt{(t.attemptLimit || 1) > 1 ? "s" : ""}</span>
                    </div>
                    <Button onClick={() => startTemplate(t._id)} disabled={startingId === t._id}>
                      {startingId === t._id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ArrowRight className="w-4 h-4 mr-1" />}
                      Start
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AssessmentLanding;