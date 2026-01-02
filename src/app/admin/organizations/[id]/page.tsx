'use client';

import { useState, useEffect, use } from 'react';
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
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Building2, CreditCard, Pencil, Users, UserPlus, Trash2, MoreHorizontal } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { OrganizationModal } from '@/components/organizations/OrganizationModal';
import { MemberModal, type MemberData } from '@/components/organizations/MemberModal';
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";

interface Organization {
    id: string;
    name: string;
    description: string | null;
    owner_id: string | null;
    credits: number;
    total_credits_purchased: number;
    total_credits_used: number;
    is_active: boolean;
    settings: any;
    created_at: string;
    updated_at: string;
}

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

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function OrganizationDetailsPage({ params }: PageProps) {
    const resolvedParams = use(params);
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [members, setMembers] = useState<OrganizationMember[]>([]);

    // Modal states
    const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
    const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);

    // Delete states
    const [memberToDelete, setMemberToDelete] = useState<OrganizationMember | null>(null);
    const [isDeletingMember, setIsDeletingMember] = useState(false);

    const fetchOrganizationData = async () => {
        try {
            setIsLoading(true);
            const [orgResponse, membersResponse] = await Promise.all([
                fetch(`/api/admin/organizations/${resolvedParams.id}`),
                fetch(`/api/admin/organizations/${resolvedParams.id}/members`)
            ]);

            if (!orgResponse.ok) throw new Error('Failed to fetch organization details');
            const orgData = await orgResponse.json();
            setOrganization(orgData);

            if (membersResponse.ok) {
                const membersData = await membersResponse.json();
                setMembers(membersData ?? []);
            }
        } catch (error) {
            console.error('Error fetching organization data:', error);
            toast({
                title: 'Error',
                description: 'Failed to load organization details',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOrganizationData();
    }, [resolvedParams.id]);

    const handleEditOrgClick = () => {
        if (organization) {
            setIsOrgModalOpen(true);
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
        if (!memberToDelete || !organization) return;
        setIsDeletingMember(true);

        try {
            const response = await fetch(`/api/admin/organizations/${organization.id}/members/${memberToDelete.id}`, {
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

            fetchOrganizationData();
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
                return 'outline';
            case 'student':
                return 'outline';
            case 'learner':
                return 'outline';
            default:
                return 'outline';
        }
    };

    if (!isLoading && !organization) {
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
                            <h1 className="text-3xl font-bold">Organization Not Found</h1>
                            <p className="text-muted-foreground">
                                The requested organization could not be found
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
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="outline"
                            onClick={() => router.back()}
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back
                        </Button>
                        <div>
                            <h1 className="text-3xl font-bold">{organization?.name || 'Organization Details'}</h1>
                            <p className="text-muted-foreground">
                                {organization?.description || 'View and manage organization information'}
                            </p>
                        </div>
                    </div>
                    <Button onClick={handleEditOrgClick} disabled={isLoading}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Organization
                    </Button>
                </div>

                <div className="grid gap-6 mb-6 md:grid-cols-2">
                    {/* Organization Info Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="h-5 w-5" />
                                Organization Info
                            </CardTitle>
                            <CardDescription>
                                Basic organization details and status
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {isLoading ? (
                                <div className="space-y-4">
                                    <div className="flex justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-6 w-16 rounded-full" /></div>
                                    <div className="flex justify-between"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-24" /></div>
                                    <div className="flex justify-between"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-32" /></div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium">Status</span>
                                        <Badge variant={organization?.is_active ? "success" : "destructive"}>
                                            {organization?.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium">Members</span>
                                        <span className="text-sm text-muted-foreground">
                                            {members.length} member{members.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium">Created</span>
                                        <span className="text-sm text-muted-foreground">
                                            {organization?.created_at ? new Date(organization.created_at).toLocaleDateString() : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium">Last Updated</span>
                                        <span className="text-sm text-muted-foreground">
                                            {organization?.updated_at ? new Date(organization.updated_at).toLocaleDateString() : 'N/A'}
                                        </span>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* Credits Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5" />
                                Credits & Usage
                            </CardTitle>
                            <CardDescription>
                                Organization&apos;s credit balance and usage
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <Skeleton className="h-20 w-full" />
                                        <Skeleton className="h-20 w-full" />
                                    </div>
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-2 w-full" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <div className="text-sm font-medium text-muted-foreground">
                                                Available Credits
                                            </div>
                                            <p className="text-2xl font-bold text-primary">
                                                {organization?.credits?.toLocaleString() || 0}
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-sm font-medium text-muted-foreground">
                                                Total Purchased
                                            </div>
                                            <p className="text-2xl font-bold">
                                                {organization?.total_credits_purchased?.toLocaleString() || 0}
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-sm font-medium text-muted-foreground">
                                                Total Used
                                            </div>
                                            <p className="text-2xl font-bold">
                                                {organization?.total_credits_used?.toLocaleString() || 0}
                                            </p>
                                        </div>
                                    </div>

                                    {organization?.total_credits_purchased && organization.total_credits_purchased > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-sm font-medium text-muted-foreground">
                                                Usage
                                            </div>
                                            <div className="flex items-center">
                                                <div className="flex-1 bg-muted rounded-full h-2">
                                                    <div
                                                        className="bg-primary rounded-full h-2"
                                                        style={{ width: `${Math.min(100, ((organization.total_credits_used || 0) / organization.total_credits_purchased) * 100)}%` }}
                                                    />
                                                </div>
                                                <span className="ml-2 text-sm font-medium">
                                                    {Math.round(((organization.total_credits_used || 0) / organization.total_credits_purchased) * 100)}%
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Members Table */}
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

                {/* Edit Organization Modal */}
                <OrganizationModal
                    open={isOrgModalOpen}
                    onOpenChange={setIsOrgModalOpen}
                    organization={organization ? {
                        id: organization.id,
                        name: organization.name,
                        description: organization.description,
                        is_active: organization.is_active,
                    } : null}
                    onSuccess={fetchOrganizationData}
                />

                {/* Member Management Modal */}
                {organization && (
                    <MemberModal
                        open={isMemberModalOpen}
                        onOpenChange={setIsMemberModalOpen}
                        organizationId={organization.id}
                        member={selectedMember}
                        onSuccess={fetchOrganizationData}
                    />
                )}

                <DeleteConfirmationDialog
                    open={!!memberToDelete}
                    onOpenChange={(open) => !open && setMemberToDelete(null)}
                    onConfirm={confirmDeleteMember}
                    title="Delete Member"
                    description={`Are you sure you want to delete ${memberToDelete?.users.name} from the organization?`}
                    isDeleting={isDeletingMember}
                />
            </div>
        </DashboardLayout>
    );
}
