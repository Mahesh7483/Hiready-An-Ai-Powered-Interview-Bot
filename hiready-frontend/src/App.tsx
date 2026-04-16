import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import ResumeAnalysis from "./pages/ResumeAnalysis";
import Interview from "./pages/Interview";
import VoiceInterview from "./pages/VoiceInterview";
import InterviewReport from "./pages/InterviewReport";
import ResumeReport from "./pages/ResumeReport";
import AptitudePlayCards from "./pages/AptitudePlayCards";
import AptitudeTest from "./pages/AptitudeTest";
import AptitudeResult from "./pages/AptitudeResult";
import AptitudePractice from "./pages/AptitudePractice";
import AptitudeTestPage from "./pages/AptitudeTestPage";
import AptitudeDashboard from "./pages/AptitudeDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/resume-analysis" element={<ResumeAnalysis />} />
          <Route path="/resume-report" element={<ResumeReport />} />
          <Route path="/interview" element={<Interview />} />
          <Route path="/voice-interview" element={<VoiceInterview />} />
          <Route path="/interview-report" element={<InterviewReport />} />
          {/* Aptitude routes */}
          <Route path="/aptitude" element={<AptitudePlayCards />} />
          <Route path="/aptitude/practice" element={<AptitudePractice />} />
          <Route path="/aptitude/test" element={<AptitudeTestPage />} />
          <Route path="/aptitude/dashboard" element={<AptitudeDashboard />} />
          <Route path="/aptitude/result" element={<AptitudeResult />} />
          {/* Legacy routes — redirect to new paths */}
          <Route path="/aptitude-play-cards" element={<AptitudePlayCards />} />
          <Route path="/aptitude-test" element={<AptitudeTest />} />
          <Route path="/aptitude-result" element={<AptitudeResult />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
