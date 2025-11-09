'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Coins, Trash2, AlertTriangle, Loader2 } from 'lucide-react';

type Organization = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  credits: number;
  total_credits_purchased: number;
  total_credits_used: number;
  is_active: boolean;
};

type OrgSettingsTabProps = {
  organization: Organization;
  isOwnerOrAdmin: boolean;
};

export default function OrgSettingsTab({ organization, isOwnerOrAdmin }: OrgSettingsTabProps) {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDeleteOrganization = async () => {
    if (deleteConfirmation !== organization.name) {
      return;
    }

    try {
      setDeleting(true);
      await axios.delete(`/api/organizations/${organization.id}`);
      router.push('/learn/org');
    } catch (error: any) {
      console.error('Failed to delete organization:', error);
      alert(error.response?.data?.error || 'Failed to delete organization');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Settings</CardTitle>
        <CardDescription>
          Manage organization preferences and billing. Credits are shared from the owner's account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-medium mb-2">Owner Credits Summary</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-muted-foreground">Available</div>
              <div className="text-2xl font-bold">{organization.credits}</div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-muted-foreground">Total Purchased</div>
              <div className="text-2xl font-bold">{organization.total_credits_purchased}</div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-muted-foreground">Total Used</div>
              <div className="text-2xl font-bold">{organization.total_credits_used}</div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => router.push('/learn/credits')}
          >
            <Coins className="w-4 h-4 mr-2" />
            Purchase Credits
          </Button>
        </div>

        {isOwnerOrAdmin && (
          <div className="pt-4 border-t">
            <h3 className="font-medium mb-2 text-red-600 dark:text-red-400">Danger Zone</h3>
            <div className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/20">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium mb-1">Delete Organization</h4>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete this organization and all associated data. This action cannot be undone.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open);
        if (!open) setDeleteConfirmation('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Delete Organization
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the organization,
              all API keys, and all member associations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>Warning:</strong> All data associated with this organization will be permanently deleted:
              </p>
              <ul className="text-sm text-red-800 dark:text-red-200 list-disc list-inside mt-2 space-y-1">
                <li>All API keys</li>
                <li>All member associations</li>
                <li>Organization settings and data</li>
              </ul>
            </div>
            <div>
              <Label htmlFor="delete-confirmation">
                Type <span className="font-mono font-bold">{organization.name}</span> to confirm
              </Label>
              <Input
                id="delete-confirmation"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder={organization.name}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeleteConfirmation('');
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteOrganization}
              disabled={deleteConfirmation !== organization.name || deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Organization
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

