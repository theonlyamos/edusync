'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Skeleton } from "@/components/ui/skeleton";

interface Admin {
  id: string;
  name: string;
  email: string;
  isactive: boolean;
  created_at: string;
}

export default function AdminsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ name: '', email: '', password: '' });

  // Delete State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/users/admins');
      if (!response.ok) throw new Error('Failed to fetch admins');
      const data = await response.json();
      setAdmins(data);
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

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/users/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAdmin)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create admin');
      }

      toast({ title: 'Success', description: 'Admin created successfully' });
      setIsModalOpen(false);
      setNewAdmin({ name: '', email: '', password: '' });
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

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/admin/users/admins/${deleteId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete admin');

      toast({
        title: 'Success',
        description: 'Admin deleted successfully',
      });

      fetchAdmins();
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete admin',
        variant: 'destructive',
      });
    } finally {
      setDeleteId(null);
      setIsDeleting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Button
              variant="ghost"
              className="mb-4"
              onClick={() => router.push('/admin/dashboard')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-bold">Admin Users</h1>
            <p className="text-muted-foreground">Manage admin users and their permissions</p>
          </div>

          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Admin
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Admin</DialogTitle>
                <DialogDescription>
                  Create a new administrator account with full access.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateAdmin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={newAdmin.name}
                    onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                    required
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newAdmin.email}
                    onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                    required
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={newAdmin.password}
                    onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                    required
                    placeholder="••••••••"
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Admin
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                // Skeleton loading state
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : admins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell className="font-medium">{admin.name}</TableCell>
                  <TableCell>{admin.email}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${admin.isactive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                      }`}>
                      {admin.isactive ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {new Date(admin.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/admin/users/admins/${admin.id}`)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteId(admin.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && admins.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <p className="text-muted-foreground">No admin users found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <DeleteConfirmationDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Administrator"
        description="This action cannot be undone. This will permanently delete the administrator account."
        isDeleting={isDeleting}
      />
    </DashboardLayout>
  );
}