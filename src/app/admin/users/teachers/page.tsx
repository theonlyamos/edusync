import { getServerSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

async function getTeachers() {
    try {
        const { data, error } = await supabase
            .from('teachers_view')
            .select('*')
            .order('createdAt', { ascending: false });
        if (error) throw error;

        return (data ?? []).map((row: any) => ({
            id: String(row.id ?? row.user_id ?? row.userId ?? ''),
            name: row.name ?? '',
            email: row.email ?? '',
            subject: Array.isArray(row.subjects) ? row.subjects.join(', ') : (row.subject ?? ''),
            gradesList: Array.isArray(row.grades) ? row.grades.join(', ') : 'Not assigned',
            status: row.isActive ? 'Active' : 'Inactive',
            createdAt: row.createdAt ?? new Date().toISOString(),
        }));
    } catch (error) {
        console.error("Error fetching teachers:", error);
        throw new Error("Failed to fetch teachers");
    }
}

export default async function TeachersPage() {
    const session = await getServerSession();

    if (!session || session.user.role !== "admin") {
        redirect("/login");
    }

    const teachers = await getTeachers();

    return (
        <DashboardLayout>
            <div className="container mx-auto py-10">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Teachers Management</h1>
                        <p className="text-muted-foreground">
                            Manage and monitor all teachers in the system
                        </p>
                    </div>
                    <Button asChild>
                        <Link href="/admin/users/teachers/create">
                            <UserPlus className="mr-2 h-4 w-4" />
                            Add Teacher
                        </Link>
                    </Button>
                </div>
                <DataTable columns={columns} data={teachers} />
            </div>
        </DashboardLayout>
    );
} 