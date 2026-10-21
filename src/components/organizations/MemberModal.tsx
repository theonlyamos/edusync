'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

export interface MemberData {
    id?: string;
    users: {
        email: string;
        name?: string;
    };
    role: 'owner' | 'admin' | 'teacher' | 'student' | 'learner';
    credits_allocated: number;
}

interface MemberModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organizationId: string;
    member?: MemberData | null;
    onSuccess?: () => void;
}

type RoleType = 'owner' | 'admin' | 'teacher' | 'student' | 'learner';

export function MemberModal({ open, onOpenChange, organizationId, member, onSuccess }: MemberModalProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const [formData, setFormData] = useState({
        email: "",
        role: "student" as RoleType,
        credits_allocated: 0,
    });

    const isEditMode = !!member?.id;
    // School teachers and students keep their role; the school changes it, not support.
    const schoolSeat = formData.role === 'teacher' || formData.role === 'student';

    useEffect(() => {
        if (member) {
            setFormData({
                email: member.users.email,
                role: ((member.role as string) === 'member' ? 'learner' : member.role) as RoleType,
                credits_allocated: member.credits_allocated,
            });
        } else {
            setFormData({
                email: "",
                role: "admin",
                credits_allocated: 0,
            });
        }
    }, [member, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const url = isEditMode
                ? `/api/admin/organizations/${organizationId}/members/${member?.id}`
                : `/api/admin/organizations/${organizationId}/members`;

            const method = isEditMode ? "PATCH" : "POST";

            const bodyData: Record<string, any> = {
                role: formData.role,
                credits_allocated: formData.credits_allocated,
            };

            if (!isEditMode) {
                bodyData.email = formData.email;
            }

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(bodyData),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `Failed to ${isEditMode ? 'update' : 'add'} member`);
            }

            toast({
                title: "Success",
                description: `Member ${isEditMode ? 'updated' : 'added'} successfully`,
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{isEditMode ? 'Edit Member' : 'Add New Member'}</DialogTitle>
                    <DialogDescription>
                        {isEditMode
                            ? 'Update member role and credits.'
                            : 'Add an existing account by email. If they have no account yet, ask them to sign up first.'
                        }
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                                id="email"
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                placeholder="user@example.com"
                                disabled={isEditMode}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="role">Role</Label>
                            <Select
                                value={formData.role}
                                onValueChange={(v: RoleType) => setFormData(prev => ({ ...prev, role: v }))}
                                disabled={schoolSeat}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="owner">Owner</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="learner">Member</SelectItem>
                                    {schoolSeat && <SelectItem value={formData.role}>{formData.role === 'teacher' ? 'Teacher' : 'Student'}</SelectItem>}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="credits">Allocated Credits</Label>
                            <Input
                                id="credits"
                                type="number"
                                min="0"
                                value={formData.credits_allocated}
                                onChange={(e) => setFormData(prev => ({ ...prev, credits_allocated: parseInt(e.target.value) || 0 }))}
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
                            {isEditMode ? 'Update Member' : 'Add Member'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
