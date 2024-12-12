import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GradeDetailsContent } from './GradeDetailsContent';
import { use } from 'react';

interface PageProps {
    params: Promise<{ level: string }>;
  }

export default function GradeDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const decodedLevel = decodeURIComponent(resolvedParams.level);
  
  return (
    <DashboardLayout>
      <GradeDetailsContent level={decodedLevel} />
    </DashboardLayout>
  );
} 