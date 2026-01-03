'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { Users, UserPlus, Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MemberModal, type MemberData } from '@/components/organizations/MemberModal';
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";

interface OrganizationMember {
    id: string;
    user_id: string;
    role: 'owner' | 'admin' | 'teacher' | 'student' | 'learner';
    credits_allocated: number;
    credits_used: number;
    joined_at: string;
    is_active: boolean;
    users: {
        id: string;
        name: string;
        email: string;
        role?: string;
    };
}

interface AdminMembersTabProps {
    organizationId: string;
}

export function AdminMembersTab({ organizationId }: AdminMembersTabProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [members, setMembers] = useState<OrganizationMember[]>([]);
    const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);
    const [memberToDelete, setMemberToDelete] = useState<OrganizationMember | null>(null);
    const [isDeletingMember, setIsDeletingMember] = useState(false);

    useEffect(() => {
        fetchMembers();
    }, [organizationId]);

    const fetchMembers = async () => {
        try {
            setIsLoading(true);
            const response = await fetch(`/api/admin/organizations/${organizationId}/members`);
            if (response.ok) {
                const data = await response.json();
                setMembers(data ?? []);
            }
        } catch (error) {
            console.error('Error fetching members:', error);
            toast({
                title: 'Error',
                description: 'Failed to load members',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddMemberClick = () => {
        setSelectedMember(null);
        setIsMemberModalOpen(true);
    };

    const handleEditMemberClick = (member: OrganizationMember) => {
        setSelectedMember({
            id: member.id,
            users: {
                email: member.users.email,
                name: member.users.name,
            },
            role: member.role,
            credits_allocated: member.credits_allocated,
        });
        setIsMemberModalOpen(true);
    };

    const handleDeleteMemberClick = (member: OrganizationMember) => {
        setMemberToDelete(member);
    };

    const confirmDeleteMember = async () => {
        if (!memberToDelete) return;
        setIsDeletingMember(true);

        try {
            const response = await fetch(`/api/admin/organizations/${organizationId}/members/${memberToDelete.id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to remove member');
            }

            toast({
                title: "Success",
                description: "Member removed successfully",
            });

            fetchMembers();
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setMemberToDelete(null);
            setIsDeletingMember(false);
        }
    };

    const getRoleBadgeVariant = (role: string) => {
        switch (role) {
            case 'owner':
                return 'default';
            case 'admin':
                return 'secondary';
            case 'teacher':
            case 'student':
            case 'learner':
            default:
                return 'outline';
        }
    };

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
                    <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Organization Members
                        </CardTitle>
                        <CardDescription>
                            Members belonging to this organization
                        </CardDescription>
                    </div>
                    <Button onClick={handleAddMemberClick} size="sm" className="ml-auto">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Member
                    </Button>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-10 w-full" />
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : members.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No members found for this organization
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Credits Allocated</TableHead>
                                    <TableHead>Credits Used</TableHead>
                                    <TableHead>Joined</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {members.map((member) => (
                                    <TableRow key={member.id}>
                                        <TableCell className="font-medium">{member.users.name}</TableCell>
                                        <TableCell>{member.users.email}</TableCell>
                                        <TableCell>
                                            <Badge variant={getRoleBadgeVariant(member.role)}>
                                                {member.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{member.credits_allocated.toLocaleString()}</TableCell>
                                        <TableCell>{member.credits_used.toLocaleString()}</TableCell>
                                        <TableCell>
                                            {new Date(member.joined_at).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={member.is_active ? "success" : "destructive"}>
                                                {member.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <span className="sr-only">Open menu</span>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleEditMemberClick(member)}>
                                                        <Pencil className="mr-2 h-4 w-4" />
                                                        Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-red-600"
                                                        onClick={() => handleDeleteMemberClick(member)}
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <MemberModal
                open={isMemberModalOpen}
                onOpenChange={setIsMemberModalOpen}
                organizationId={organizationId}
                member={selectedMember}
                onSuccess={fetchMembers}
            />

            <DeleteConfirmationDialog
                open={!!memberToDelete}
                onOpenChange={(open) => !open && setMemberToDelete(null)}
                onConfirm={confirmDeleteMember}
                title="Delete Member"
                description={`Are you sure you want to delete ${memberToDelete?.users.name} from the organization?`}
                isDeleting={isDeletingMember}
            />
        </>
    );
}
