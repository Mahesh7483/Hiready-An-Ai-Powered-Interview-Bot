import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GraduationCap, Target, LayoutGrid, LogOut, Menu, X, ShieldCheck, Briefcase } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { hireAPI } from "@/lib/hireApi";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";
import { toast } from "sonner";

interface DashboardLayoutProps {
  children: React.ReactNode;
  hideSidebar?: boolean;
}

const DashboardLayout = ({ children, hideSidebar = false }: DashboardLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Same query key HireLayout uses, so the two share one cached answer.
  // retry:false because /hire/me answers 404 for a student, which is not a
  // failure worth retrying three times on every dashboard load.
  const { data: hireMe } = useQuery({
    queryKey: ["hire", "me"],
    queryFn: hireAPI.me,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const hasHireAccess = (hireMe?.companies?.length ?? 0) > 0;

  // Get user initials for avatar fallback
  const getInitials = (displayName: string | null) => {
    if (!displayName) return "U";
    return displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("You have been signed out");
      navigate("/login");
    } catch (error) {
      toast.error("Failed to sign out");
      console.error("Logout error:", error);
    }
  };

  // Two flows, and only two. Either the app chooses the work (Mastery) or the
  // student does (Practice). Records are no longer a third group — each lives
  // inside the thing it belongs to.
  const navItems = [
    { path: "/mastery", label: "Mastery", hint: "Today's session", icon: Target },
    { path: "/practice", label: "Practice", hint: "Choose your own", icon: LayoutGrid },
  ];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div className="min-h-screen bg-background">
      {!hideSidebar && (
        <>
          {/* Mobile Header */}
          <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-50 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground">HiREady</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>

          {/* Sidebar */}
          <aside
            className={`fixed top-0 left-0 h-full bg-sidebar border-r border-sidebar-border z-40 transition-transform duration-300 ${
              isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            } lg:translate-x-0 w-64 flex flex-col`}
          >
            {/* Logo */}
            <div className="p-6 border-b border-sidebar-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="font-bold text-sidebar-foreground">HiREady</h1>
                  <p className="text-xs text-muted-foreground">AI Interview Coach</p>
                </div>
              </div>
            </div>

            {/* Navigation (scrollable so it never hides the profile on short
                screens). The reserved space must cover the whole absolutely
                positioned footer below — avatar block plus THREE buttons now,
                where it was one. pb-28 was sized for the old footer and would
                let the account links sit on top of the nav on a short viewport. */}
            <div className="flex-1 overflow-y-auto pb-56">
              <nav className="p-4 space-y-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsSidebarOpen(false)}
                      className={`flex items-start gap-3 px-4 py-3 rounded-lg transition-colors ${
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                      }`}
                    >
                      <Icon className="w-5 h-5 mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block">{item.label}</span>
                        <span className="block text-xs text-muted-foreground font-normal">
                          {item.hint}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* User Profile */}
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border">
              <div className="flex items-center gap-3 mb-3">
                <Avatar>
                  <AvatarImage src={user?.photoURL || ""} alt={user?.displayName || "User"} />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {getInitials(user?.displayName || null)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">
                    {user?.displayName || "User"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email || "No email"}</p>
                </div>
              </div>
              {/* Account-level links, deliberately here rather than in the nav
                  above: that nav is the two practice flows and adding a third
                  item would blur what it means.

                  /privacy had no entry point anywhere in the app. It was
                  reachable only by typing the URL or by following a redirect
                  after accepting an invite — so a student who had never been
                  invited could not find the screen that tells them which
                  companies can see their data, which is the one screen they
                  have the strongest right to reach. */}
              <Link to="/privacy" className="block">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground"
                >
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Who can see you
                </Button>
              </Link>

              {/* Only for people who actually have hiring access. The query is
                  shared with HireLayout's, so this costs nothing extra once
                  either has run, and a student never sees a door that opens
                  onto a refusal. */}
              {hasHireAccess && (
                <Link to="/hire" className="block">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground"
                  >
                    <Briefcase className="w-4 h-4 mr-2" />
                    For employers
                  </Button>
                </Link>
              )}

              <Button
                variant="ghost"
                className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleLogout}
                disabled={loading}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </Button>
            </div>
          </aside>

          {/* Overlay for mobile */}
          {isSidebarOpen && (
            <div
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}
        </>
      )}

      {/* Main Content */}
      <main className={`${hideSidebar ? "" : "lg:ml-64 pt-16 lg:pt-0"} min-h-screen`}>
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
