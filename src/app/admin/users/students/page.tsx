'use client';

import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import { DataTable } from "@/components/ui/data-table";
import { getColumns, Student } from "./columns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus } from "lucide-react";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { StudentModal, type StudentData } from "@/components/users/StudentModal";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function StudentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);

  // Delete State
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const getStudents = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/users/students');
      if (!response.ok) throw new Error('Failed to fetch students');
      const data = await response.json();

      // Map Supabase response to our Student type
      const mappedStudents: Student[] = (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name ?? '',
        email: row.email ?? '',
        grade: row.grade ?? '',
        status: (row.isactive ?? row.isActive) ? 'Active' : 'Inactive',
        createdAt: row.createdat ?? row.createdAt ?? new Date().toISOString(),
      }));

      setStudents(mappedStudents);
      setFilteredStudents(mappedStudents);
    } catch (error) {
      console.error("Error fetching students:", error);
      toast({
        title: 'Error',
        description: 'Failed to load students',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getStudents();
  }, []);

  useEffect(() => {
    const lowerQuery = searchQuery.toLowerCase();
    const filtered = students.filter(student =>
      student.name.toLowerCase().includes(lowerQuery) ||
      student.email.toLowerCase().includes(lowerQuery) ||
      student.grade.toLowerCase().includes(lowerQuery)
    );
    setFilteredStudents(filtered);
  }, [searchQuery, students]);

  const handleView = (student: Student) => {
    router.push(`/admin/users/students/${student.id}`);
  };

  const handleEdit = (student: Student) => {
    setSelectedStudent({
      id: student.id,
      name: student.name,
      email: student.email,
      grade: student.grade,
      status: student.status,
      guardianName: student.guardianName,
      guardianContact: student.guardianContact,
    });
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedStudent(null);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (student: Student) => {
    setStudentToDelete(student);
  };

  const confirmDelete = async () => {
    if (!studentToDelete) return;
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/users/students/${studentToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete student');
      }

      toast({
        title: "Success",
        description: "Student deleted successfully",
      });

      getStudents(); // Refresh the list
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setStudentToDelete(null);
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
            <h1 className="text-2xl font-bold tracking-tight">Student Management</h1>
            <p className="text-muted-foreground">
              Manage and monitor all students in the system
            </p>
          </div>
          <Button onClick={handleCreate} className="whitespace-nowrap">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Student
          </Button>
        </div>

        <div className="flex items-center justify-end py-4">
          <Input
            placeholder="Search students..."
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
          <DataTable columns={columns} data={filteredStudents} />
        )}

        <StudentModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          student={selectedStudent}
          onSuccess={getStudents}
        />

        <DeleteConfirmationDialog
          open={!!studentToDelete}
          onOpenChange={(open) => !open && setStudentToDelete(null)}
          onConfirm={confirmDelete}
          title="Delete Student"
          description="This action cannot be undone. This will permanently delete the student account and remove their data from our servers."
          isDeleting={isDeleting}
        />
      </div>
    </DashboardLayout>
  );
}