'use client';

import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import { DataTable } from "@/components/ui/data-table";
import { getColumns, Admin } from "./columns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Loader2 } from "lucide-react";

export default function AdminsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredAdmins, setFilteredAdmins] = useState<Admin[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');

  // Delete State
  const [adminToDelete, setAdminToDelete] = useState<Admin | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/users/admins');
      if (!response.ok) throw new Error('Failed to fetch admins');
      const data = await response.json();

      // Map Supabase response to our Admin type
      const mappedAdmins: Admin[] = (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name ?? '',
        email: row.email ?? '',
        status: (row.isactive ?? row.isActive) ? 'Active' : 'Inactive',
        createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
      }));

      setAdmins(mappedAdmins);
      setFilteredAdmins(mappedAdmins);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch admin users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  useEffect(() => {
    const lowerQuery = searchQuery.toLowerCase();
    const filtered = admins.filter(admin =>
      admin.name.toLowerCase().includes(lowerQuery) ||
      admin.email.toLowerCase().includes(lowerQuery)
    );
    setFilteredAdmins(filtered);
  }, [searchQuery, admins]);

  const handleView = (admin: Admin) => {
    router.push(`/admin/users/admins/${admin.id}`);
  };

  const handleDeleteClick = (admin: Admin) => {
    setAdminToDelete(admin);
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/users/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newAdminEmail })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to add admin');
      }

      toast({ title: 'Admin added', description: `${newAdminEmail} now has platform admin access.` });
      setIsModalOpen(false);
      setNewAdminEmail('');
      fetchAdmins();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!adminToDelete) return;
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/users/admins/${adminToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to remove admin');
      }

      toast({
        title: "Admin removed",
        description: "Their account stays, without admin access.",
      });

      fetchAdmins();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAdminToDelete(null);
      setIsDeleting(false);
    }
  };

  const columns = getColumns({
    onView: handleView,
    onDelete: handleDeleteClick
  });

  return (
    <>
      <div>
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin Users</h1>
            <p className="text-muted-foreground">
              People with platform support access
            </p>
          </div>

          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button className="whitespace-nowrap">
                <Plus className="mr-2 h-4 w-4" />
                Add Admin
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a platform admin</DialogTitle>
                <DialogDescription>
                  Give an existing account full support access. They sign in with their own password. If they have no account yet, ask them to sign up first.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateAdmin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    required
                    placeholder="john@example.com"
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add admin
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center justify-end py-4">
          <Input
            placeholder="Search admins..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="max-w-sm"
          />
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <Skeleton className="h-12 w-full" />
            </div>
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        ) : (
          <DataTable columns={columns} data={filteredAdmins} />
        )}

        <DeleteConfirmationDialog
          open={!!adminToDelete}
          onOpenChange={(open) => !open && setAdminToDelete(null)}
          onConfirm={confirmDelete}
          title="Remove admin access"
          description="They keep their account but lose platform admin access. You can add them back later."
          isDeleting={isDeleting}
        />
      </div>
    </>
  );
}