import { useQuery } from "@tanstack/react-query";
import { ShieldX } from "lucide-react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { adminAPI } from "@/lib/adminApi";

/**
 * Route guard for /admin/* — verifies the signed-in user's role via the
 * backend (which re-checks it against the DB on every request).
 */
export const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-me"],
    queryFn: adminAPI.me,
    retry: false,
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Verifying access…</p>
        </div>
      </div>
    );
  }

  if (isError || data?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <ShieldX className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Access denied</h1>
          <p className="text-sm text-muted-foreground mt-2">
            You don't have permission to view the admin panel. Ask an existing admin to grant you
            access.
          </p>
          <Link to="/dashboard">
            <Button variant="outline" className="mt-6">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return <AdminLayout>{children}</AdminLayout>;
};
