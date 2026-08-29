import { NavLink, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users as UsersIcon,
  BookOpen,
  ClipboardList,
  ShieldAlert,
  Video,
  ArrowLeft,
  Layers,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Users", icon: UsersIcon, end: false },
  { to: "/admin/questions", label: "Question Bank", icon: BookOpen, end: false },
  { to: "/admin/results", label: "Test Results", icon: ClipboardList, end: false },
  { to: "/admin/interviews", label: "Interviews", icon: Video, end: false },
  { to: "/admin/proctoring", label: "Proctoring", icon: ShieldAlert, end: false },
  { to: "/admin/assessments", label: "Assessments", icon: Layers, end: false },
];

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border bg-card hidden md:flex md:flex-col">
        <div className="p-5 border-b border-border">
          <Link to="/dashboard" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
              <span className="text-white text-xs font-bold">HR</span>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">HiREady</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Admin Panel</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border">
          <NavLink
            to="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to App
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top nav */}
        <header className="md:hidden border-b border-border bg-card px-4 py-3 overflow-x-auto">
          <div className="flex gap-2">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium ${
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;
