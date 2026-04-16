import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GraduationCap, LayoutDashboard, FileText, MessageSquare, Brain, LogOut, Menu, X } from "lucide-react";
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

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/resume-analysis", label: "Resume Analysis", icon: FileText },
    { path: "/interview", label: "Mock Interview", icon: MessageSquare },
    { path: "/aptitude", label: "Aptitude", icon: Brain },
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
            } lg:translate-x-0 w-64`}
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

            {/* Navigation */}
            <nav className="p-4 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsSidebarOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

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
