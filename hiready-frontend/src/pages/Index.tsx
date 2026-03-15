import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GraduationCap, FileCheck, MessageSquare, TrendingUp, ArrowRight, CheckCircle2 } from "lucide-react";
import heroIllustration from "@/assets/hero-illustration.png";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">HiREady</h1>
              <p className="text-xs text-muted-foreground">AI Interview Coach</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link to="/signup">
              <Button className="bg-gradient-primary hover:opacity-90 transition-opacity">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-hero py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-5xl font-bold text-foreground mb-6">
                Ace Your Next Interview with{" "}
                <span className="text-primary">AI-Powered</span> Preparation
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Get personalized feedback on your resume and practice with our autonomous AI interviewer. Build confidence and land your dream job.
              </p>
              <div className="flex gap-4">
                <Link to="/signup">
                  <Button size="lg" className="bg-gradient-primary hover:opacity-90 transition-opacity">
                    Start Free Trial <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="outline">
                    Watch Demo
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative">
              <img 
                src={heroIllustration} 
                alt="AI Interview Preparation" 
                className="w-full h-auto rounded-2xl shadow-xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-foreground mb-4">
              Everything You Need to Succeed
            </h3>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our AI-powered platform provides comprehensive interview preparation tools to help you stand out
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-card p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow border border-border">
              <div className="w-14 h-14 rounded-lg bg-accent/10 flex items-center justify-center mb-6">
                <FileCheck className="w-7 h-7 text-accent" />
              </div>
              <h4 className="text-xl font-semibold text-foreground mb-3">AI Resume Analysis</h4>
              <p className="text-muted-foreground mb-4">
                Get instant feedback on your resume's ATS compatibility, strengths, and areas for improvement
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">ATS compatibility score</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Keyword optimization tips</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Role-specific suggestions</span>
                </li>
              </ul>
            </div>

            <div className="bg-card p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow border border-border">
              <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                <MessageSquare className="w-7 h-7 text-primary" />
              </div>
              <h4 className="text-xl font-semibold text-foreground mb-3">Real-Time Mock Interviews</h4>
              <p className="text-muted-foreground mb-4">
                Practice with our autonomous AI interviewer that adapts questions based on your responses
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Autonomous question flow</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Real-time transcript</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Natural conversation flow</span>
                </li>
              </ul>
            </div>

            <div className="bg-card p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow border border-border">
              <div className="w-14 h-14 rounded-lg bg-metric/10 flex items-center justify-center mb-6">
                <TrendingUp className="w-7 h-7 text-metric" />
              </div>
              <h4 className="text-xl font-semibold text-foreground mb-3">Detailed Performance Insights</h4>
              <p className="text-muted-foreground mb-4">
                Receive comprehensive feedback on your interview performance with actionable insights
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Confidence & communication scores</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Content relevance analysis</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Improvement recommendations</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-primary py-20">
        <div className="container mx-auto px-4 text-center">
          <h3 className="text-4xl font-bold text-primary-foreground mb-6">
            Ready to Ace Your Next Interview?
          </h3>
          <p className="text-xl text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
            Join thousands of job seekers who have improved their interview skills with HiREady
          </p>
          <Link to="/signup">
            <Button size="lg" variant="secondary" className="bg-card hover:bg-card/90">
              Get Started for Free <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © 2025 HiREady. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
