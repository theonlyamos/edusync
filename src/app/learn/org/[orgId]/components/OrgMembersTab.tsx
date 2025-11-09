'use client';

import { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Coins, Trash2, Users } from 'lucide-react';

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

type OrgMembersTabProps = {
  organization: Organization;
  isOwnerOrAdmin: boolean;
  onRefresh: () => Promise<void>;
};

export default function OrgMembersTab({ organization, isOwnerOrAdmin, onRefresh }: OrgMembersTabProps) {
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState('');
  const [addMemberRole, setAddMemberRole] = useState<'admin' | 'member'>('member');
  const [showAllocateCreditsDialog, setShowAllocateCreditsDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<OrganizationMember | null>(null);
  const [allocateCreditsAmount, setAllocateCreditsAmount] = useState(0);
  const [updating, setUpdating] = useState(false);
  
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [showBulkAllocateDialog, setShowBulkAllocateDialog] = useState(false);
  const [bulkCreditsAmount, setBulkCreditsAmount] = useState(0);

  const selectableMembers = organization.organization_members.filter(m => m.role !== 'owner');
  const allSelectableSelected = selectableMembers.length > 0 && selectableMembers.every(m => selectedMembers.has(m.id));

  const handleAddMember = async () => {
    try {
      setUpdating(true);
      
      const response = await axios.get('/api/users/search', {
        params: { email: addMemberEmail }
      });
      
      const userId = response.data.user?.id;
      
      if (!userId) {
        alert('User not found with that email');
        return;
      }

      await axios.post(`/api/organizations/${organization.id}/members`, {
        user_id: userId,
        role: addMemberRole,
        credits_allocated: 0
      });

      await onRefresh();
      setShowAddMemberDialog(false);
      setAddMemberEmail('');
      setAddMemberRole('member');
    } catch (error: any) {
      console.error('Failed to add member:', error);
      alert(error.response?.data?.error || 'Failed to add member');
    } finally {
      setUpdating(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) {
      return;
    }

    try {
      await axios.delete(`/api/organizations/${organization.id}/members/${memberId}`);
      await onRefresh();
    } catch (error: any) {
      console.error('Failed to remove member:', error);
      alert(error.response?.data?.error || 'Failed to remove member');
    }
  };

  const handleAllocateCredits = async () => {
    if (!selectedMember) return;

    try {
      setUpdating(true);
      await axios.post(`/api/organizations/${organization.id}/credits`, {
        member_id: selectedMember.id,
        credits: allocateCreditsAmount
      });

      await onRefresh();
      setShowAllocateCreditsDialog(false);
      setSelectedMember(null);
      setAllocateCreditsAmount(0);
    } catch (error: any) {
      console.error('Failed to allocate credits:', error);
      alert(error.response?.data?.error || 'Failed to allocate credits');
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateMemberRole = async (memberId: string, newRole: 'admin' | 'member') => {
    try {
      await axios.patch(`/api/organizations/${organization.id}/members/${memberId}`, {
        role: newRole
      });
      await onRefresh();
    } catch (error: any) {
      console.error('Failed to update member role:', error);
      alert(error.response?.data?.error || 'Failed to update member role');
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedMembers(new Set());
    } else {
      setSelectedMembers(new Set(selectableMembers.map(m => m.id)));
    }
  };

  const handleBulkRemove = async () => {
    if (selectedMembers.size === 0) return;

    const count = selectedMembers.size;
    if (!confirm(`Are you sure you want to remove ${count} member${count > 1 ? 's' : ''}?`)) {
      return;
    }

    try {
      setUpdating(true);
      await Promise.all(
        Array.from(selectedMembers).map(memberId =>
          axios.delete(`/api/organizations/${organization.id}/members/${memberId}`)
        )
      );
      await onRefresh();
      setSelectedMembers(new Set());
    } catch (error: any) {
      console.error('Failed to remove members:', error);
      alert(error.response?.data?.error || 'Failed to remove some members');
    } finally {
      setUpdating(false);
    }
  };

  const handleBulkAllocateCredits = async () => {
    if (selectedMembers.size === 0) return;

    try {
      setUpdating(true);
      await Promise.all(
        Array.from(selectedMembers).map(memberId =>
          axios.post(`/api/organizations/${organization.id}/credits`, {
            member_id: memberId,
            credits: bulkCreditsAmount
          })
        )
      );
      await onRefresh();
      setShowBulkAllocateDialog(false);
      setSelectedMembers(new Set());
      setBulkCreditsAmount(0);
    } catch (error: any) {
      console.error('Failed to allocate credits:', error);
      alert(error.response?.data?.error || 'Failed to allocate credits to some members');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Organization Members</CardTitle>
              <CardDescription>
                Manage team members and their credit allocations
              </CardDescription>
            </div>
            {isOwnerOrAdmin && (
              <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Organization Member</DialogTitle>
                    <DialogDescription>
                      Add a user to your organization by their email address
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        value={addMemberEmail}
                        onChange={(e) => setAddMemberEmail(e.target.value)}
                        placeholder="user@example.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <Select value={addMemberRole} onValueChange={(v) => setAddMemberRole(v as 'admin' | 'member')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAddMemberDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddMember} disabled={!addMemberEmail || updating}>
                      {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Member'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isOwnerOrAdmin && selectedMembers.size > 0 && (
            <div className="mb-4 p-3 bg-muted rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {selectedMembers.size} member{selectedMembers.size > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowBulkAllocateDialog(true)}
                  disabled={updating}
                >
                  <Coins className="w-4 h-4 mr-1" />
                  Bulk Allocate Credits
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkRemove}
                  disabled={updating}
                >
                  {updating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-1" />
                      Remove Selected
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
          
          <Table>
            <TableHeader>
              <TableRow>
                {isOwnerOrAdmin && (
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allSelectableSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all members"
                    />
                  </TableHead>
                )}
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Credits Allocated</TableHead>
                <TableHead>Credits Used</TableHead>
                <TableHead>Joined</TableHead>
                {isOwnerOrAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {organization.organization_members.map((member) => (
                <TableRow key={member.id}>
                  {isOwnerOrAdmin && (
                    <TableCell>
                      {member.role !== 'owner' && (
                        <Checkbox
                          checked={selectedMembers.has(member.id)}
                          onCheckedChange={() => toggleMemberSelection(member.id)}
                          aria-label={`Select ${member.users.name}`}
                        />
                      )}
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{member.users.name}</TableCell>
                  <TableCell>{member.users.email}</TableCell>
                  <TableCell>
                    {isOwnerOrAdmin && member.role !== 'owner' ? (
                      <Select
                        value={member.role}
                        onValueChange={(v) => handleUpdateMemberRole(member.id, v as 'admin' | 'member')}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                        {member.role}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{member.credits_allocated}</TableCell>
                  <TableCell>{member.credits_used}</TableCell>
                  <TableCell>{new Date(member.joined_at).toLocaleDateString()}</TableCell>
                  {isOwnerOrAdmin && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedMember(member);
                            setAllocateCreditsAmount(member.credits_allocated);
                            setShowAllocateCreditsDialog(true);
                          }}
                        >
                          <Coins className="w-4 h-4 mr-1" />
                          Allocate
                        </Button>
                        {member.role !== 'owner' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showAllocateCreditsDialog} onOpenChange={setShowAllocateCreditsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate Credits</DialogTitle>
            <DialogDescription>
              Allocate credits to {selectedMember?.users.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="credits">Credits Amount</Label>
              <Input
                id="credits"
                type="number"
                min="0"
                max={organization.credits + (selectedMember?.credits_allocated || 0)}
                value={allocateCreditsAmount}
                onChange={(e) => setAllocateCreditsAmount(parseInt(e.target.value) || 0)}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Available organization credits: {organization.credits}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAllocateCreditsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAllocateCredits} disabled={updating}>
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Allocate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkAllocateDialog} onOpenChange={setShowBulkAllocateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Allocate Credits</DialogTitle>
            <DialogDescription>
              Allocate credits to {selectedMembers.size} selected member{selectedMembers.size > 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="bulk-credits">Credits Amount</Label>
              <Input
                id="bulk-credits"
                type="number"
                min="0"
                value={bulkCreditsAmount}
                onChange={(e) => setBulkCreditsAmount(parseInt(e.target.value) || 0)}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Available organization credits: {organization.credits}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Each selected member will be allocated {bulkCreditsAmount} credits
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowBulkAllocateDialog(false);
              setBulkCreditsAmount(0);
            }}>
              Cancel
            </Button>
            <Button onClick={handleBulkAllocateCredits} disabled={updating || bulkCreditsAmount === 0}>
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Allocate to All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

