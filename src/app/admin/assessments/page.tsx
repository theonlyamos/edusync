import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";
import { getAssessments } from "@/lib/actions/assessment.actions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default async function AdminAssessmentsPage() {
  const assessments = await getAssessments();

  return (
    <DashboardLayout role="admin">
      <div className="container mx-auto py-10">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Assessments Management</h1>
        </div>
        <DataTable columns={columns} data={assessments} />
      </div>
    </DashboardLayout>
  );
} 