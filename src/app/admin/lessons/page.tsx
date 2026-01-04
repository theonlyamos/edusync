'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DataTable } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, Trash, BookOpen, Plus } from "lucide-react";
import Link from "next/link";
import { AdminLessonModal } from "@/components/lessons/AdminLessonModal";

interface Lesson {
    id: string;
    title: string;
    subject: string;
    gradelevel: string;
    objectives?: string[];
    content?: string;
    teacher_id?: string;
    teacherName?: string;
    created_at: string;
    updated_at: string;
}

export default function AdminLessonsPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        fetchLessons();
    }, []);

    const fetchLessons = async () => {
        try {
            const response = await fetch('/api/admin/lessons');
            if (!response.ok) throw new Error('Failed to fetch lessons');
            const data = await response.json();
            setLessons(data);
        } catch (error) {
            console.error('Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to fetch lessons',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this lesson?')) return;

        try {
            const response = await fetch(`/api/admin/lessons/${id}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to delete lesson');

            toast({
                title: 'Success',
                description: 'Lesson deleted successfully',
            });

            fetchLessons();
        } catch (error) {
            console.error('Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to delete lesson',
                variant: 'destructive',
            });
        }
    };

    const columns: ColumnDef<Lesson>[] = [
        {
            accessorKey: "title",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Title" />
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{row.getValue("title")}</span>
                </div>
            ),
        },
        {
            accessorKey: "subject",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Subject" />
            ),
            cell: ({ row }) => (
                <Badge variant="secondary">{row.getValue("subject")}</Badge>
            ),
        },
        {
            accessorKey: "gradelevel",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Grade Level" />
            ),
            cell: ({ row }) => (
                <Badge variant="outline">{(row.getValue("gradelevel") as string)?.toUpperCase()}</Badge>
            ),
        },
        {
            accessorKey: "teacherName",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Teacher" />
            ),
            cell: ({ row }) => row.getValue("teacherName") || <span className="text-muted-foreground">Not assigned</span>,
        },
        {
            accessorKey: "created_at",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Created" />
            ),
            cell: ({ row }) => {
                const date = new Date(row.getValue("created_at"));
                return <div>{date.toLocaleDateString()}</div>;
            },
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const lesson = row.original;

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                                <Link href={`/admin/lessons/${lesson.id}`}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Details
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleDelete(lesson.id)}
                            >
                                <Trash className="mr-2 h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },
    ];

    return (
        <DashboardLayout>
            <div className="container mx-auto py-10">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">Lessons Management</h1>
                        <p className="text-muted-foreground">View and manage all lessons</p>
                    </div>
                    <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Create Lesson
                    </Button>
                </div>
                {loading ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 mb-4">
                            <Skeleton className="h-10 w-64" />
                            <Skeleton className="h-10 w-32" />
                        </div>
                        <Skeleton className="h-12 w-full" />
                        {[...Array(5)].map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                        ))}
                    </div>
                ) : (
                    <DataTable columns={columns} data={lessons} />
                )}

                <AdminLessonModal
                    open={isModalOpen}
                    onOpenChange={setIsModalOpen}
                    onSuccess={fetchLessons}
                />
            </div>
        </DashboardLayout>
    );
}
