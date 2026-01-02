'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Building2 } from 'lucide-react';

export interface OrganizationData {
    id?: string;
    name: string;
    description: string | null;
    is_active?: boolean;
}

interface OrganizationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organization?: OrganizationData | null;
    onSuccess?: () => void;
}

export function OrganizationModal({ open, onOpenChange, organization, onSuccess }: OrganizationModalProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        description: "",
    });

    const isEditMode = !!organization?.id;

    useEffect(() => {
        if (organization) {
            setFormData({
                name: organization.name || "",
                description: organization.description || "",
            });
        } else {
            setFormData({
                name: "",
                description: "",
            });
        }
    }, [organization, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const url = isEditMode
                ? `/api/admin/organizations/${organization.id}`
                : "/api/admin/organizations";

            const method = isEditMode ? "PATCH" : "POST";

            const bodyData: Record<string, any> = {
                name: formData.name,
                description: formData.description || null,
            };

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(bodyData),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `Failed to ${isEditMode ? 'update' : 'create'} organization`);
            }

            toast({
                title: "Success",
                description: `Organization ${isEditMode ? 'updated' : 'created'} successfully`,
            });

            onSuccess?.();
            onOpenChange(false);
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{isEditMode ? 'Edit Organization' : 'Add New Organization'}</DialogTitle>
                    <DialogDescription>
                        {isEditMode
                            ? 'Update the organization details below.'
                            : 'Create a new organization to manage users and resources.'
                        }
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Building2 className="h-4 w-4" />
                            Organization Details
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="name">Organization Name</Label>
                            <Input
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleInputChange}
                                placeholder="Acme Corporation"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                name="description"
                                value={formData.description}
                                onChange={handleInputChange}
                                placeholder="A brief description of the organization..."
                                rows={3}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {isEditMode ? 'Update Organization' : 'Create Organization'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
