import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, ChevronLeft, ChevronRight, Trash2, Loader2, Eye, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { adminAPI, type AdminUser } from "@/lib/adminApi";

const AdminUsers = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const usersQuery = useQuery({
    queryKey: ["admin-users", page, search, roleFilter],
    queryFn: () => adminAPI.getUsers({ page, limit: 10, search, role: roleFilter }),
    placeholderData: (prev) => prev,
  });

  const detailQuery = useQuery({
    queryKey: ["admin-user-detail", selectedId],
    queryFn: () => adminAPI.getUserDetail(selectedId!),
    enabled: !!selectedId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    if (selectedId) queryClient.invalidateQueries({ queryKey: ["admin-user-detail", selectedId] });
  };

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "user" | "admin" }) => adminAPI.setUserRole(id, role),
    onSuccess: (data) => {
      toast.success(`${data.user.email} is now ${data.user.role}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminAPI.deleteUser(id),
    onSuccess: () => {
      toast.success("User deleted");
      setDeleteTarget(null);
      setSelectedId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const data = usersQuery.data;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data ? `${data.total} registered` : "Loading…"}
          </p>
        </div>
        <div className="flex gap-2">
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search name or email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 w-56"
            />
          </form>
          <Select
            value={roleFilter}
            onValueChange={(v) => {
              setRoleFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="user">Users</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
            </SelectContent>
</Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const csv = await adminAPI.exportUsersCsv();
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'users.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success('Users CSV downloaded');
                } catch {
                  toast.error('Failed to export users');
                }
              }}
            >
              <Download className="mr-2 w-4 h-4" /> Export CSV
            </Button>
          </div>

      <Card className="border border-border overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Tests</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.isLoading &&
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(6)].map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!usersQuery.isLoading && data?.users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              )}

              {data?.users.map((u) => (
                <TableRow
                  key={u._id}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(u._id)}
                >
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{u.testCount ?? 0}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={u.role}
                        onValueChange={(role: "user" | "admin") =>
                          roleMutation.mutate({ id: u._id, role })
                        }
                        disabled={roleMutation.isPending}
                      >
                        <SelectTrigger className="h-8 w-[104px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Make user</SelectItem>
                          <SelectItem value="admin">Make admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        onClick={(e) => { e.stopPropagation(); navigate(`/admin/users/${u._id}`); }}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> Details
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={u.role === "admin"}
                        title={u.role === "admin" ? "Demote before deleting" : "Delete user"}
                        onClick={() => setDeleteTarget(u)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {data.page} of {data.pages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || usersQuery.isFetching}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.pages || usersQuery.isFetching}
              onClick={() => setPage((p) => Math.min(p + 1, data.pages))}
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail sheet */}
      <Sheet open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detailQuery.isLoading || !detailQuery.data ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <SheetHeader className="pb-2">
                <SheetTitle>{detailQuery.data.user.name}</SheetTitle>
                <SheetDescription>{detailQuery.data.user.email}</SheetDescription>
              </SheetHeader>

              <Tabs defaultValue="results" className="mt-4">
                <TabsList>
                  <TabsTrigger value="results">
                    Results ({detailQuery.data.results.length})
                  </TabsTrigger>
                  <TabsTrigger value="logs">Proctor ({detailQuery.data.logs.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="results" className="space-y-3 mt-4">
                  {detailQuery.data.results.length === 0 && (
                    <p className="text-sm text-muted-foreground">No test results recorded.</p>
                  )}
                  {detailQuery.data.results.map((r) => (
                    <div key={r._id} className="p-3 rounded-lg border border-border bg-muted/30">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium capitalize">
                          {r.topic} · {r.mode}
                        </span>
                        <Badge variant={r.score / Math.max(r.totalQuestions, 1) >= 0.6 ? "secondary" : "destructive"}>
                          {r.score}/{r.totalQuestions}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                        {r.timeTaken ? ` · ${r.timeTaken}` : ""}
                        {r.warningCount > 0 ? ` · ${r.warningCount} warnings` : ""}
                      </p>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="logs" className="space-y-2 mt-4">
                  {detailQuery.data.logs.length === 0 && (
                    <p className="text-sm text-muted-foreground">No proctor events recorded.</p>
                  )}
                  {detailQuery.data.logs.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/30"
                    >
                      <span className="text-sm">{l.event.replace(/_/g, " ")}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(l.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the account along with all test results and proctor logs.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUsers;
