'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { use } from 'react';

interface Admin {
  _id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  createdAt: string;
  lastLogin?: string;
  lastActivity?: string;
  permissions?: string[];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AdminDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    status: '',
    permissions: [] as string[],
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    
    if (status === 'authenticated') {
      if (session?.user?.role !== 'admin') {
        switch (session?.user?.role) {
          case 'teacher':
            router.replace('/teachers/dashboard');
            break;
          case 'student':
            router.replace('/students/dashboard');
            break;
          default:
            router.replace('/login');
        }
        return;
      }

      const fetchAdmin = async () => {
        try {
          const response = await fetch(`/api/admin/users/admins/${resolvedParams.id}`);
          if (!response.ok) throw new Error('Failed to fetch admin details');
          const data = await response.json();
          setAdmin(data);
          setFormData({
            name: data.name,
            email: data.email,
            status: data.status,
            permissions: data.permissions || [],
          });
        } catch (error) {
          console.error('Error fetching admin:', error);
          toast({
            title: 'Error',
            description: 'Failed to load admin details',
            variant: 'destructive',
          });
          router.push('/admin/users/admins');
        } finally {
          setIsLoading(false);
        }
      };

      fetchAdmin();
    }
  }, [session, status, router, resolvedParams.id, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/users/admins/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      toast({
        title: 'Success',
        description: 'Admin details updated successfully',
      });

      // Refresh admin data
      const updatedAdmin = await response.json();
      setAdmin(updatedAdmin);
    } catch (error) {
      console.error('Error updating admin:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update admin details',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleStatusChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      status: value,
    }));
  };

  const handlePermissionToggle = (permission: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission],
    }));
  };

  if (status === 'loading' || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (status === 'unauthenticated' || session?.user?.role !== 'admin') {
    return null;
  }

  if (!admin) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <Button 
              variant="outline" 
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Admin Not Found</h1>
              <p className="text-muted-foreground">
                The requested admin could not be found
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="outline" 
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Admin Details</h1>
            <p className="text-muted-foreground">
              View and manage admin information
            </p>
          </div>
        </div>

        <div className="grid gap-6 mb-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Basic account details and status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Account Status</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  admin.status === 'active' 
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {admin.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Joined</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(admin.createdAt).toLocaleDateString()}
                </span>
              </div>
              {admin.lastLogin && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Last Login</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(admin.lastLogin).toLocaleString()}
                  </span>
                </div>
              )}
              {admin.lastActivity && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Last Activity</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(admin.lastActivity).toLocaleString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Permissions</CardTitle>
              <CardDescription>
                Administrative access and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {admin.permissions?.map((permission, index) => (
                  <div
                    key={index}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary mr-2 mb-2"
                  >
                    {permission}
                  </div>
                ))}
                {(!admin.permissions || admin.permissions.length === 0) && (
                  <p className="text-sm text-muted-foreground">
                    No specific permissions assigned
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Edit Admin Information</CardTitle>
            <CardDescription>
              Update the admin's profile information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Account Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={handleStatusChange}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving Changes
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
} 