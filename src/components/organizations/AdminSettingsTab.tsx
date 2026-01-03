'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Trash2, AlertTriangle, Loader2, Settings, Coins } from 'lucide-react';

interface Organization {
    id: string;
    name: string;
    description: string | null;
    credits: number;
    total_credits_purchased: number;
    total_credits_used: number;
    is_active: boolean;
}

interface AdminSettingsTabProps {
    organization: Organization;
    onRefresh: () => void;
}

export function AdminSettingsTab({ organization, onRefresh }: AdminSettingsTabProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [showAddCreditsDialog, setShowAddCreditsDialog] = useState(false);
    const [creditsToAdd, setCreditsToAdd] = useState('');
    const [addingCredits, setAddingCredits] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    const handleDeleteOrganization = async () => {
        if (deleteConfirmation !== organization.name) return;

        try {
            setDeleting(true);
            const response = await fetch(`/api/admin/organizations/${organization.id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete organization');
            }

            toast({
                title: 'Success',
                description: 'Organization deleted successfully',
            });
            router.push('/admin/organizations');
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to delete organization',
                variant: 'destructive',
            });
        } finally {
            setDeleting(false);
        }
    };

    const handleAddCredits = async () => {
        const amount = parseInt(creditsToAdd);
        if (isNaN(amount) || amount <= 0) return;

        try {
            setAddingCredits(true);
            const response = await fetch(`/api/admin/organizations/${organization.id}/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credits: organization.credits + amount }),
            });

            if (!response.ok) throw new Error('Failed to add credits');

            toast({
                title: 'Success',
                description: `Added ${amount} credits to the organization`,
            });
            setShowAddCreditsDialog(false);
            setCreditsToAdd('');
            onRefresh();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: 'Failed to add credits',
                variant: 'destructive',
            });
        } finally {
            setAddingCredits(false);
        }
    };

    const handleToggleActive = async () => {
        try {
            setUpdatingStatus(true);
            const response = await fetch(`/api/admin/organizations/${organization.id}/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !organization.is_active }),
            });

            if (!response.ok) throw new Error('Failed to update status');

            toast({
                title: 'Success',
                description: `Organization ${organization.is_active ? 'deactivated' : 'activated'} successfully`,
            });
            onRefresh();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: 'Failed to update organization status',
                variant: 'destructive',
            });
        } finally {
            setUpdatingStatus(false);
        }
    };

    return (
        <>
            <div className="space-y-6">
                {/* Credits Management */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Coins className="h-5 w-5" />
                            Credits Management
                        </CardTitle>
                        <CardDescription>
                            Manage organization credits
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="p-4 border rounded-lg">
                                <div className="text-sm text-muted-foreground">Available</div>
                                <div className="text-2xl font-bold text-primary">{organization.credits.toLocaleString()}</div>
                            </div>
                            <div className="p-4 border rounded-lg">
                                <div className="text-sm text-muted-foreground">Total Purchased</div>
                                <div className="text-2xl font-bold">{organization.total_credits_purchased.toLocaleString()}</div>
                            </div>
                            <div className="p-4 border rounded-lg">
                                <div className="text-sm text-muted-foreground">Total Used</div>
                                <div className="text-2xl font-bold">{organization.total_credits_used.toLocaleString()}</div>
                            </div>
                        </div>
                        <Button onClick={() => setShowAddCreditsDialog(true)}>
                            <Coins className="w-4 h-4 mr-2" />
                            Add Credits
                        </Button>
                    </CardContent>
                </Card>

                {/* Organization Status */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings className="h-5 w-5" />
                            Organization Status
                        </CardTitle>
                        <CardDescription>
                            Control organization access and visibility
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-medium">Active Status</div>
                                <div className="text-sm text-muted-foreground">
                                    {organization.is_active
                                        ? 'Organization is currently active and accessible'
                                        : 'Organization is deactivated and members cannot access it'}
                                </div>
                            </div>
                            <Switch
                                checked={organization.is_active}
                                onCheckedChange={handleToggleActive}
                                disabled={updatingStatus}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Danger Zone */}
                <Card className="border-red-200 dark:border-red-800">
                    <CardHeader>
                        <CardTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            Danger Zone
                        </CardTitle>
                        <CardDescription>
                            Irreversible actions that affect the organization
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/20">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h4 className="font-medium mb-1">Delete Organization</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Permanently delete this organization and all associated data. This action cannot be undone.
                                    </p>
                                </div>
                                <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Add Credits Dialog */}
            <Dialog open={showAddCreditsDialog} onOpenChange={setShowAddCreditsDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Credits</DialogTitle>
                        <DialogDescription>
                            Add credits to the organization's balance
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="credits-amount">Amount to Add</Label>
                            <Input
                                id="credits-amount"
                                type="number"
                                min="1"
                                value={creditsToAdd}
                                onChange={(e) => setCreditsToAdd(e.target.value)}
                                placeholder="100"
                            />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Current balance: {organization.credits.toLocaleString()} credits
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddCreditsDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAddCredits}
                            disabled={!creditsToAdd || parseInt(creditsToAdd) <= 0 || addingCredits}
                        >
                            {addingCredits ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Add Credits
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
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
        </>
    );
}
