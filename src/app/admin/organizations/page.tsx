'use client';

import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import { DataTable } from "@/components/ui/data-table";
import { getColumns, Organization } from "./columns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2 } from "lucide-react";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { OrganizationModal, type OrganizationData } from "@/components/organizations/OrganizationModal";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrganizationsPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [filteredOrganizations, setFilteredOrganizations] = useState<Organization[]>([]);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedOrganization, setSelectedOrganization] = useState<OrganizationData | null>(null);

    // Delete State
    const [organizationToDelete, setOrganizationToDelete] = useState<Organization | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const getOrganizations = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/admin/organizations');
            if (!response.ok) throw new Error('Failed to fetch organizations');
            const data = await response.json();
            setOrganizations(data ?? []);
            setFilteredOrganizations(data ?? []);
        } catch (error) {
            console.error("Error fetching organizations:", error);
            toast({
                title: 'Error',
                description: 'Failed to load organizations',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        getOrganizations();
    }, []);

    useEffect(() => {
        const lowerQuery = searchQuery.toLowerCase();
        const filtered = organizations.filter(org =>
            org.name.toLowerCase().includes(lowerQuery) ||
            (org.description?.toLowerCase().includes(lowerQuery) ?? false)
        );
        setFilteredOrganizations(filtered);
    }, [searchQuery, organizations]);

    const handleView = (organization: Organization) => {
        router.push(`/admin/organizations/${organization.id}`);
    };

    const handleEdit = (organization: Organization) => {
        setSelectedOrganization({
            id: organization.id,
            name: organization.name,
            description: organization.description,
            is_active: organization.is_active,
        });
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setSelectedOrganization(null);
        setIsModalOpen(true);
    };

    const handleDeleteClick = (organization: Organization) => {
        setOrganizationToDelete(organization);
    };

    const confirmDelete = async () => {
        if (!organizationToDelete) return;
        setIsDeleting(true);

        try {
            const response = await fetch(`/api/admin/organizations/${organizationToDelete.id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete organization');
            }

            toast({
                title: "Success",
                description: "Organization deactivated successfully",
            });

            getOrganizations(); // Refresh the list
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setOrganizationToDelete(null);
            setIsDeleting(false);
        }
    };

    const columns = getColumns({
        onView: handleView,
        onEdit: handleEdit,
        onDelete: handleDeleteClick
    });

    return (
        <DashboardLayout>
            <div className="container mx-auto py-10">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Organization Management</h1>
                        <p className="text-muted-foreground">
                            Manage and monitor all organizations in the system
                        </p>
                    </div>
                    <Button onClick={handleCreate} className="whitespace-nowrap">
                        <Building2 className="mr-2 h-4 w-4" />
                        Add Organization
                    </Button>
                </div>

                <div className="flex items-center justify-end py-4">
                    <Input
                        placeholder="Search organizations..."
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
                    <DataTable columns={columns} data={filteredOrganizations} />
                )}

                <OrganizationModal
                    open={isModalOpen}
                    onOpenChange={setIsModalOpen}
                    organization={selectedOrganization}
                    onSuccess={getOrganizations}
                />

                <DeleteConfirmationDialog
                    open={!!organizationToDelete}
                    onOpenChange={(open) => !open && setOrganizationToDelete(null)}
                    onConfirm={confirmDelete}
                    title="Delete Organization"
                    description="This action will deactivate the organization. Members will lose access to organization resources."
                    isDeleting={isDeleting}
                />
            </div>
        </DashboardLayout>
    );
}
