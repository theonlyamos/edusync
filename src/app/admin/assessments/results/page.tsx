import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAssessmentResults } from "@/lib/actions/assessment.actions";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default async function AssessmentResultsPage() {
  const results = await getAssessmentResults();
  
  // Calculate average scores by subject
  const subjectAverages = results.reduce((acc: any, result) => {
    const subject = result.assessment.subject;
    if (!acc[subject]) {
      acc[subject] = { scores: [], average: 0 };
    }
    acc[subject].scores.push((result.score / result.assessment.totalMarks) * 100);
    acc[subject].average = acc[subject].scores.reduce((a: number, b: number) => a + b, 0) / acc[subject].scores.length;
    return acc;
  }, {});

  const chartData = Object.entries(subjectAverages).map(([subject, data]: [string, any]) => ({
    subject,
    average: Math.round(data.average),
  }));

  return (
    <DashboardLayout role="admin">
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-8">Assessment Results Overview</h1>
        
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Total Assessments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{results.length}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Average Score</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {Math.round(
                  results.reduce((acc, result) => 
                    acc + (result.score / result.assessment.totalMarks) * 100, 0
                  ) / results.length
                )}%
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Subjects Covered</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{Object.keys(subjectAverages).length}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Average Scores by Subject</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="subject" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="average" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
} 