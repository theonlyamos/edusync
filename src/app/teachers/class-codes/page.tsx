import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { JoinCodesCard } from '@/components/school/JoinCodesCard';

export default function TeacherClassCodesPage() {
  return (
    <DashboardLayout>
      <div className="container max-w-3xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Class codes</h1>
          <p className="text-muted-foreground">Make a code for a class so students can ask to join your school.</p>
        </div>
        <JoinCodesCard />
      </div>
    </DashboardLayout>
  );
}
