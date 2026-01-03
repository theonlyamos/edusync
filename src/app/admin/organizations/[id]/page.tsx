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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Building2, CreditCard, Pencil, Users, Key, Settings } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { OrganizationModal } from '@/components/organizations/OrganizationModal';
import { AdminMembersTab } from '@/components/organizations/AdminMembersTab';
import { AdminApiKeysTab } from '@/components/organizations/AdminApiKeysTab';
import { AdminSettingsTab } from '@/components/organizations/AdminSettingsTab';

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

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function OrganizationDetailsPage({ params }: PageProps) {
    const resolvedParams = use(params);
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [organization, setOrganization] = useState<Organization | null>(null);

    // Modal states
    const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);

    const fetchOrganizationData = async () => {
        try {
            setIsLoading(true);
            const orgResponse = await fetch(`/api/admin/organizations/${resolvedParams.id}`);

            if (!orgResponse.ok) throw new Error('Failed to fetch organization details');
            const orgData = await orgResponse.json();
            setOrganization(orgData);
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

                <Tabs defaultValue="overview" className="space-y-6">
                    <TabsList>
                        <TabsTrigger value="overview">
                            <Building2 className="w-4 h-4 mr-2" />
                            Overview
                        </TabsTrigger>
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

                    {/* Overview Tab */}
                    <TabsContent value="overview">
                        <div className="grid gap-6 md:grid-cols-2">
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

                                            {organization?.total_credits_purchased && organization.total_credits_purchased > 0 ? (
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
                                            ) : null}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* Members Tab */}
                    <TabsContent value="members">
                        <AdminMembersTab organizationId={resolvedParams.id} />
                    </TabsContent>

                    {/* API Keys Tab */}
                    <TabsContent value="api-keys">
                        <AdminApiKeysTab organizationId={resolvedParams.id} />
                    </TabsContent>

                    {/* Settings Tab */}
                    <TabsContent value="settings">
                        {organization && (
                            <AdminSettingsTab
                                organization={organization}
                                onRefresh={fetchOrganizationData}
                            />
                        )}
                    </TabsContent>
                </Tabs>

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
            </div>
        </DashboardLayout>
    );
}
