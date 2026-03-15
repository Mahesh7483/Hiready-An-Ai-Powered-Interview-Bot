/**
 * Example: Dashboard Header with User Info and Sign Out
 * 
 * This is an example file showing how to integrate the Google Authentication
 * with your dashboard. Copy this pattern to your actual Dashboard component.
 */

import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * Example Dashboard Header Component
 * Demonstrates how to:
 * - Display user information from Google
 * - Show user avatar
 * - Implement sign-out functionality
 * - Handle logout errors
 */
export const DashboardHeaderExample = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="h-16 bg-card border-b border-border" />;
  }

  if (!user) {
    return null; // Should be protected by ProtectedRoute
  }

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

  return (
    <header className="border-b border-border bg-card sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {user.displayName || "User"}!
            </p>
          </div>

          {/* User Menu Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.photoURL || ""} alt={user.displayName || "User"} />
                  <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.displayName}</p>
                <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

/**
 * Usage in your Dashboard component:
 * 
 * import { ProtectedRoute } from "@/components/ProtectedRoute";
 * import { DashboardHeaderExample } from "@/example/DashboardHeaderExample";
 * 
 * export function Dashboard() {
 *   return (
 *     <ProtectedRoute>
 *       <DashboardHeaderExample />
 *       {* Rest of dashboard content *}
 *     </ProtectedRoute>
 *   );
 * }
 */

/**
 * User data available from useAuth() hook:
 * 
 * interface UserData {
 *   uid: string;              // Firebase unique ID
 *   displayName: string | null;  // User's full name
 *   email: string | null;        // User's email
 *   photoURL: string | null;     // User's profile picture
 * }
 */
