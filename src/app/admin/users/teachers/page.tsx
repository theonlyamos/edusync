'use client';

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { getColumns, Teacher } from "./columns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, UserPlus } from "lucide-react";
import { TeacherModal } from "@/components/users/TeacherModal";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";


export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | undefined>(undefined);
  const [filteredTeachers, setFilteredTeachers] = useState<Teacher[]>([]);

  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const getTeachers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users/teachers`);
      if (!response.ok) throw new Error('Failed to fetch teacher details');
      const data = await response.json();

      const mappedTeachers = (data ?? []).map((row: any) => ({
        id: String(row.id ?? row.user_id ?? row.userId ?? ''),
        name: row.name ?? '',
        email: row.email ?? '',
        subject: Array.isArray(row.subjects) ? row.subjects.join(', ') : (row.subject ?? ''),
        gradesList: Array.isArray(row.grades) ? row.grades.join(', ') : 'Not assigned',
        status: row.isactive ? 'Active' : 'Inactive',
        createdAt: row.createdat ?? new Date().toISOString(),
        // Pass original row data needed for edit form if not already in Teacher type
        subjects: row.subjects,
        grades: row.grades,
        qualifications: row.qualifications,
        specializations: row.specializations
      }));

      setTeachers(mappedTeachers);
      setFilteredTeachers(mappedTeachers);
    } catch (error) {
      console.error("Error fetching teachers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getTeachers();
  }, []);

  useEffect(() => {
    const lowerQuery = searchQuery.toLowerCase();
    const filtered = teachers.filter(teacher =>
      teacher.name.toLowerCase().includes(lowerQuery) ||
      teacher.email.toLowerCase().includes(lowerQuery) ||
      teacher.subject.toLowerCase().includes(lowerQuery)
    );
    setFilteredTeachers(filtered);
  }, [searchQuery, teachers]);

  const handleEdit = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedTeacher(undefined);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (teacher: Teacher) => {
    setTeacherToDelete(teacher);
  };

  const confirmDelete = async () => {
    if (!teacherToDelete) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/users/teachers/${teacherToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete teacher');
      }

      toast({
        title: "Success",
        description: "Teacher deleted successfully",
      });

      getTeachers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setTeacherToDelete(null);
      setIsDeleting(false);
    }
  };

  const columns = getColumns({ onEdit: handleEdit, onDelete: handleDeleteClick });

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
          <Button onClick={handleCreate} className="whitespace-nowrap">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Teacher
          </Button>
        </div>

        <div className="flex items-center justify-end py-4">
          <Input
            placeholder="Search teachers..."
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
          <DataTable columns={columns} data={filteredTeachers} />
        )}
        <TeacherModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          teacher={selectedTeacher}
          onSuccess={getTeachers}
        />

        <DeleteConfirmationDialog
          open={!!teacherToDelete}
          onOpenChange={(open) => !open && setTeacherToDelete(null)}
          onConfirm={confirmDelete}
          title="Delete Teacher"
          description="This action cannot be undone. This will permanently delete the teacher account and remove their data from our servers."
          isDeleting={isDeleting}
        />
      </div>
    </DashboardLayout>
  );
} 