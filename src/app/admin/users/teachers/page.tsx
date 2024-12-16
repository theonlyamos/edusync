import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";
import { User } from "@/lib/models/User";
import { Teacher } from "@/lib/models/Teacher";
import { connectToDatabase } from "@/lib/db";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import Link from "next/link";

async function getTeachers() {
    try {
        await connectToDatabase();
        
        const users = await User.find({ role: "teacher" })
            .select("-password")
            .lean();

        const teacherDetails = await Promise.all(
            users.map(async (user) => {
                const teacher = await Teacher.findOne({ userId: user._id })
                    .select("-createdAt -updatedAt")
                    .lean();
                return {
                    ...user,
                    ...teacher,
                    id: user._id.toString(),
                    userId: user._id.toString(),
                    status: user.isActive ? "Active" : "Inactive",
                    gradesList: teacher?.grades?.join(", ") || "Not assigned"
                };
            })
        );

        return teacherDetails;
    } catch (error) {
        console.error("Error fetching teachers:", error);
        throw new Error("Failed to fetch teachers");
    }
}

export default async function TeachersPage() {
    const session = await getServerSession(authOptions);

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