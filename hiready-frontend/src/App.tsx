import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/admin/AdminRoute";
import Index from "./pages/Index";
import { PageLoader } from "./components/PageLoader";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";

// Route-level code splitting: every page except the landing screen loads on
// demand. This keeps heavy libs (TensorFlow proctoring, Monaco, Recharts,
// pdfjs/mammoth, Deepgram) out of the initial bundle entirely.
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));

// The two flows.
const Mastery = lazy(() => import("./pages/Mastery"));
const Practice = lazy(() => import("./pages/Practice"));

const ResumeAnalysis = lazy(() => import("./pages/ResumeAnalysis"));
const Interview = lazy(() => import("./pages/Interview"));
const VoiceInterview = lazy(() => import("./pages/VoiceInterview"));
const InterviewReport = lazy(() => import("./pages/InterviewReport"));
const InterviewHistory = lazy(() => import("./pages/InterviewHistory"));
const ResumeHistory = lazy(() => import("./pages/ResumeHistory"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const WrongAnswersNotebook = lazy(() => import("./pages/WrongAnswersNotebook"));
const ResumeReport = lazy(() => import("./pages/ResumeReport"));
const AptitudeStart = lazy(() => import("./pages/AptitudeStart"));
const AptitudeTest = lazy(() => import("./pages/AptitudeTest"));
const AptitudeResult = lazy(() => import("./pages/AptitudeResult"));
const AptitudeDashboard = lazy(() => import("./pages/AptitudeDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CodingInterview = lazy(() => import("./pages/CodingInterview"));
const AssessmentLanding = lazy(() => import("./pages/AssessmentLanding"));
const AssessmentPipeline = lazy(() => import("./pages/AssessmentPipeline"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminQuestions = lazy(() => import("./pages/admin/AdminQuestions"));
const AdminResults = lazy(() => import("./pages/admin/AdminResults"));
const AdminProctoring = lazy(() => import("./pages/admin/AdminProctoring"));
const AdminInterviews = lazy(() => import("./pages/admin/AdminInterviews"));
const AdminUserDetail = lazy(() => import("./pages/admin/AdminUserDetail"));
const AdminAssessments = lazy(() => import("./pages/admin/AdminAssessments"));
const AdminCodingQuestions = lazy(() => import("./pages/admin/AdminCodingQuestions"));
const AdminCompanies = lazy(() => import("./pages/admin/AdminCompanies"));
const AdminDisclosure = lazy(() => import("./pages/admin/AdminDisclosure"));

// Employer surface — guarded server-side by requireCompany, not by a client role.
const HirePipeline = lazy(() => import("./pages/hire/HirePipeline"));
const HireJob = lazy(() => import("./pages/hire/HireJob"));
const HireCandidate = lazy(() => import("./pages/hire/HireCandidate"));
const HireDiscover = lazy(() => import("./pages/hire/HireDiscover"));
const HireInvites = lazy(() => import("./pages/hire/HireInvites"));
const HireCompare = lazy(() => import("./pages/hire/HireCompare"));

// Candidate-side consent
const Privacy = lazy(() => import("./pages/Privacy"));
const InviteAccept = lazy(() => import("./pages/InviteAccept"));
const AdminMastery = lazy(() => import("./pages/admin/AdminMastery"));

const queryClient = new QueryClient();

/** Old path -> new path. Kept for one release so existing links and bookmarks
 *  keep working, then deleted along with this array. */
const LEGACY_REDIRECTS: Array<[string, string]> = [
  ["/dashboard", "/mastery"],

  ["/wrong-answers", "/mastery/review"],
  ["/aptitude/notebook", "/mastery/review"],
  ["/aptitude-notebook", "/mastery/review"],

  ["/aptitude", "/practice/aptitude"],
  ["/aptitude-practice", "/practice/aptitude/practice"],
  ["/aptitude/practice", "/practice/aptitude/practice"],
  ["/aptitude-test-page", "/practice/aptitude/test"],
  ["/aptitude-test", "/practice/aptitude/run"],
  ["/aptitude/test", "/practice/aptitude/run"],
  ["/aptitude-result", "/practice/aptitude/result"],
  ["/aptitude/result", "/practice/aptitude/result"],
  ["/aptitude-dashboard", "/practice/aptitude/stats"],
  ["/aptitude/dashboard", "/practice/aptitude/stats"],

  ["/coding", "/practice/coding"],
  ["/coding-interview", "/practice/coding"],

  ["/interview", "/practice/interview"],
  ["/voice-interview", "/practice/interview/live"],
  ["/interview-history", "/practice/interview/history"],
  ["/interview-report", "/practice/interview/report"],

  ["/assessments", "/practice/assessment"],
  ["/assessments/take", "/practice/assessment/take"],

  ["/resume-analysis", "/practice/resume"],
  ["/resume-report", "/practice/resume/report"],
  ["/my-resumes", "/practice/resume/library"],
  ["/resume-history", "/practice/resume/library"],

  ["/leaderboard", "/practice/leaderboard"],
];

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
              {/* Public */}
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />

              {/* ── Mastery — the app chooses the work ── */}
              <Route path="/mastery" element={<ProtectedRoute><Mastery /></ProtectedRoute>} />
              <Route path="/mastery/review" element={<ProtectedRoute><WrongAnswersNotebook /></ProtectedRoute>} />

              {/* ── Practice — the student chooses ── */}
              <Route path="/practice" element={<ProtectedRoute><Practice /></ProtectedRoute>} />

              <Route path="/practice/aptitude" element={<ProtectedRoute><AptitudeStart /></ProtectedRoute>} />
              {/* One configurator now. /practice and /test were two near-identical
                  ones, and /test was unreachable — the Test card went straight to
                  the runner, so a timed test never used its own settings. */}
              <Route path="/practice/aptitude/practice" element={<Navigate to="/practice/aptitude" replace />} />
              <Route path="/practice/aptitude/test" element={<Navigate to="/practice/aptitude" replace />} />
              <Route path="/practice/aptitude/run" element={<ProtectedRoute><AptitudeTest /></ProtectedRoute>} />
              <Route path="/practice/aptitude/result" element={<ProtectedRoute><AptitudeResult /></ProtectedRoute>} />
              <Route path="/practice/aptitude/stats" element={<ProtectedRoute><AptitudeDashboard /></ProtectedRoute>} />

              <Route path="/practice/coding" element={<ProtectedRoute><CodingInterview /></ProtectedRoute>} />

              <Route path="/practice/interview" element={<ProtectedRoute><Interview /></ProtectedRoute>} />
              <Route path="/practice/interview/live" element={<ProtectedRoute><VoiceInterview /></ProtectedRoute>} />
              <Route path="/practice/interview/history" element={<ProtectedRoute><InterviewHistory /></ProtectedRoute>} />
              <Route path="/practice/interview/report" element={<ProtectedRoute><InterviewReport /></ProtectedRoute>} />

              <Route path="/practice/assessment" element={<ProtectedRoute><AssessmentLanding /></ProtectedRoute>} />
              <Route path="/practice/assessment/take" element={<ProtectedRoute><AssessmentPipeline /></ProtectedRoute>} />

              <Route path="/practice/resume" element={<ProtectedRoute><ResumeAnalysis /></ProtectedRoute>} />
              {/* static "library" outranks the dynamic report route — do not reorder */}
              <Route path="/practice/resume/library" element={<ProtectedRoute><ResumeHistory /></ProtectedRoute>} />
              <Route path="/practice/resume/report" element={<ProtectedRoute><ResumeReport /></ProtectedRoute>} />

              <Route path="/practice/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />

              {/* ── Legacy paths — one release of grace, then delete ── */}
              {LEGACY_REDIRECTS.map(([from, to]) => (
                <Route key={from} path={from} element={<Navigate to={to} replace />} />
              ))}

              {/* Admin routes — role-guarded via backend check */}
              <Route path="/admin" element={<AdminRoute><AdminOverview /></AdminRoute>} />
              <Route path="/admin/mastery" element={<AdminRoute><AdminMastery /></AdminRoute>} />
              <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
              <Route path="/admin/questions" element={<AdminRoute><AdminQuestions /></AdminRoute>} />
              <Route path="/admin/results" element={<AdminRoute><AdminResults /></AdminRoute>} />
              <Route path="/admin/proctoring" element={<AdminRoute><AdminProctoring /></AdminRoute>} />
              <Route path="/admin/interviews" element={<AdminRoute><AdminInterviews /></AdminRoute>} />
              <Route path="/admin/assessments" element={<AdminRoute><AdminAssessments /></AdminRoute>} />
              <Route path="/admin/coding-questions" element={<AdminRoute><AdminCodingQuestions /></AdminRoute>} />
              <Route path="/admin/users/:id" element={<AdminRoute><AdminUserDetail /></AdminRoute>} />
              <Route path="/admin/companies" element={<AdminRoute><AdminCompanies /></AdminRoute>} />
              <Route path="/admin/disclosure" element={<AdminRoute><AdminDisclosure /></AdminRoute>} />

              {/* ── Employer surface. Access is decided server-side by
                     requireCompany; ProtectedRoute only ensures a login. ── */}
              <Route path="/hire" element={<ProtectedRoute><HirePipeline /></ProtectedRoute>} />
              <Route path="/hire/jobs/:id" element={<ProtectedRoute><HireJob /></ProtectedRoute>} />
              <Route path="/hire/candidates/:id" element={<ProtectedRoute><HireCandidate /></ProtectedRoute>} />
              <Route path="/hire/discover" element={<ProtectedRoute><HireDiscover /></ProtectedRoute>} />
              <Route path="/hire/invites" element={<ProtectedRoute><HireInvites /></ProtectedRoute>} />
              <Route path="/hire/compare" element={<ProtectedRoute><HireCompare /></ProtectedRoute>} />

              {/* ── Candidate consent ── */}
              <Route path="/privacy" element={<ProtectedRoute><Privacy /></ProtectedRoute>} />
              <Route path="/invite/:token" element={<ProtectedRoute><InviteAccept /></ProtectedRoute>} />

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
