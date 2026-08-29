import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/admin/AdminRoute";
import Index from "./pages/Index";
import { PageLoader } from "./components/PageLoader";

// Route-level code splitting: every page except the landing screen loads on
// demand. This keeps heavy libs (TensorFlow proctoring, Monaco, Recharts,
// pdfjs/mammoth, Deepgram) out of the initial bundle entirely.
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ResumeAnalysis = lazy(() => import("./pages/ResumeAnalysis"));
const Interview = lazy(() => import("./pages/Interview"));
const VoiceInterview = lazy(() => import("./pages/VoiceInterview"));
const InterviewReport = lazy(() => import("./pages/InterviewReport"));
const InterviewHistory = lazy(() => import("./pages/InterviewHistory"));
const ResumeHistory = lazy(() => import("./pages/ResumeHistory"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const WrongAnswersNotebook = lazy(() => import("./pages/WrongAnswersNotebook"));
const ResumeReport = lazy(() => import("./pages/ResumeReport"));
const AptitudePlayCards = lazy(() => import("./pages/AptitudePlayCards"));
const AptitudeTest = lazy(() => import("./pages/AptitudeTest"));
const AptitudeResult = lazy(() => import("./pages/AptitudeResult"));
const AptitudePractice = lazy(() => import("./pages/AptitudePractice"));
const AptitudeTestPage = lazy(() => import("./pages/AptitudeTestPage"));
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          {/* Private routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/resume-analysis" element={<ProtectedRoute><ResumeAnalysis /></ProtectedRoute>} />
          <Route path="/resume-report" element={<ProtectedRoute><ResumeReport /></ProtectedRoute>} />
          <Route path="/interview" element={<ProtectedRoute><Interview /></ProtectedRoute>} />
          <Route path="/voice-interview" element={<ProtectedRoute><VoiceInterview /></ProtectedRoute>} />
          <Route path="/interview-report" element={<ProtectedRoute><InterviewReport /></ProtectedRoute>} />
          <Route path="/interview-history" element={<ProtectedRoute><InterviewHistory /></ProtectedRoute>} />
          <Route path="/coding-interview" element={<ProtectedRoute><CodingInterview /></ProtectedRoute>} />
          <Route path="/my-resumes" element={<ProtectedRoute><ResumeHistory /></ProtectedRoute>} />
          <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
          <Route path="/aptitude/notebook" element={<ProtectedRoute><WrongAnswersNotebook /></ProtectedRoute>} />
          {/* Aptitude routes */}
          <Route path="/aptitude" element={<ProtectedRoute><AptitudePlayCards /></ProtectedRoute>} />
          <Route path="/aptitude/practice" element={<ProtectedRoute><AptitudePractice /></ProtectedRoute>} />
          <Route path="/aptitude/test" element={<ProtectedRoute><AptitudeTestPage /></ProtectedRoute>} />
          <Route path="/aptitude/dashboard" element={<ProtectedRoute><AptitudeDashboard /></ProtectedRoute>} />
          <Route path="/aptitude/result" element={<ProtectedRoute><AptitudeResult /></ProtectedRoute>} />
          {/* Legacy routes — redirect to new paths */}
          <Route path="/aptitude-play-cards" element={<ProtectedRoute><AptitudePlayCards /></ProtectedRoute>} />
          <Route path="/aptitude-test" element={<ProtectedRoute><AptitudeTest /></ProtectedRoute>} />
          <Route path="/aptitude-result" element={<ProtectedRoute><AptitudeResult /></ProtectedRoute>} />
          {/* Admin routes — role-guarded via backend check */}
          <Route path="/admin" element={<AdminRoute><AdminOverview /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
          <Route path="/admin/questions" element={<AdminRoute><AdminQuestions /></AdminRoute>} />
          <Route path="/admin/results" element={<AdminRoute><AdminResults /></AdminRoute>} />
          <Route path="/admin/proctoring" element={<AdminRoute><AdminProctoring /></AdminRoute>} />
          <Route path="/admin/interviews" element={<AdminRoute><AdminInterviews /></AdminRoute>} />
          <Route path="/admin/assessments" element={<AdminRoute><AdminAssessments /></AdminRoute>} />
          <Route path="/admin/users/:id" element={<AdminRoute><AdminUserDetail /></AdminRoute>} />
          {/* Assessment routes */}
          <Route path="/assessments" element={<ProtectedRoute><AssessmentLanding /></ProtectedRoute>} />
          <Route path="/assessments/take" element={<ProtectedRoute><AssessmentPipeline /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
