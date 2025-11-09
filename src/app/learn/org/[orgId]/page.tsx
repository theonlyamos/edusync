'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Settings, Users, Coins, Key, Edit, ChevronLeft, AlertCircle, CheckCircle } from 'lucide-react';
import OrgMembersTab from './components/OrgMembersTab';
import OrgApiKeysTab from './components/OrgApiKeysTab';
import OrgSettingsTab from './components/OrgSettingsTab';

type Organization = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  credits: number;
  total_credits_purchased: number;
  total_credits_used: number;
  is_active: boolean;
  organization_members: OrganizationMember[];
};

type OrganizationMember = {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  credits_allocated: number;
  credits_used: number;
  joined_at: string;
  is_active: boolean;
  users: {
    id: string;
    name: string;
    email: string;
  };
};

export default function OrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', description: '' });
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (orgId) {
      fetchOrganization();
    }
  }, [orgId]);

  const fetchOrganization = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/organizations/${orgId}`);
      setOrganization(response.data.organization);
      setEditFormData({
        name: response.data.organization.name,
        description: response.data.organization.description || ''
      });
    } catch (error) {
      console.error('Failed to fetch organization:', error);
      router.push('/learn/org');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOrganization = async () => {
    try {
      setUpdating(true);
      await axios.patch(`/api/organizations/${orgId}`, editFormData);
      await fetchOrganization();
      setEditMode(false);
    } catch (error: any) {
      console.error('Failed to update organization:', error);
      alert(error.response?.data?.error || 'Failed to update organization');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="container max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Organization not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentUserMember = organization.organization_members.find(
    (m) => m.is_active
  );
  const isOwnerOrAdmin = !!currentUserMember && ['owner', 'admin'].includes(currentUserMember.role);

  return (
    <div className="container max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/learn/org')}
          className="mb-4"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Organizations
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{organization.name}</h1>
              {isOwnerOrAdmin && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditMode(true)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
              )}
            </div>
            {organization.description && (
              <p className="text-muted-foreground mt-1">{organization.description}</p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Available Credits</div>
              <div className="text-2xl font-bold flex items-center gap-1">
                <Coins className="w-5 h-5 text-yellow-500" />
                {organization.credits}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>×</Button>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-2 animate-in slide-in-from-top">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSuccess(null)}>×</Button>
        </div>
      )}

      <Tabs defaultValue="members" className="space-y-4">
        <TabsList>
          <TabsTrigger value="members">
            <Users className="w-4 h-4 mr-2" />
            Members
          </TabsTrigger>
          <TabsTrigger value="api-keys">
            <Key className="w-4 h-4 mr-2" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <OrgMembersTab 
            organization={organization}
            isOwnerOrAdmin={isOwnerOrAdmin}
            onRefresh={fetchOrganization}
          />
        </TabsContent>

        <TabsContent value="api-keys">
          <OrgApiKeysTab 
            organizationId={orgId}
            isOwnerOrAdmin={isOwnerOrAdmin}
            onError={setError}
            onSuccess={setSuccess}
          />
        </TabsContent>

        <TabsContent value="settings">
          <OrgSettingsTab 
            organization={organization}
            isOwnerOrAdmin={isOwnerOrAdmin}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={editMode} onOpenChange={setEditMode}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>
              Update your organization name and description
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                placeholder="Organization Name"
              />
            </div>
            <div>
              <Label htmlFor="org-description">Description</Label>
              <Textarea
                id="org-description"
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                placeholder="Description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMode(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateOrganization} disabled={updating}>
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

