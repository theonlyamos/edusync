import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAssessmentResults } from "@/lib/actions/assessment.actions";

export default async function AssessmentResultsPage() {
  const results = (await getAssessmentResults()) as any[];

  const subjectToScores: Record<string, number[]> = {};
  let overallSum = 0;
  let overallCount = 0;

  for (const r of results) {
    const totalPoints = r.assessment?.totalPoints ?? r.assessment?.total_points ?? 0;
    const pct = typeof r.percentage === 'number'
      ? r.percentage
      : (typeof r.score === 'number' && totalPoints > 0)
        ? Math.min(100, Math.max(0, (r.score / totalPoints) * 100))
        : 0;
    const subject: string = r.assessment?.subject ?? 'Unknown';
    subjectToScores[subject] = subjectToScores[subject] || [];
    subjectToScores[subject].push(pct);
    overallSum += pct;
    overallCount += 1;
  }

  const subjectRows = Object.entries(subjectToScores).map(([subject, scores]) => {
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return { subject, average: avg };
  }).sort((a, b) => b.average - a.average);

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
                {results.length ? Math.round(
                  results.reduce((acc, result) => acc + 0, 0) / results.length
                ) : 0}%
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Subjects Covered</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{Object.keys(subjectToScores).length}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Average Scores by Subject</CardTitle>
          </CardHeader>
          <CardContent>
            {subjectRows.length === 0 ? (
              <div className="h-[120px] flex items-center justify-center text-muted-foreground">
                No data available yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Average %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjectRows.map((row) => (
                    <TableRow key={row.subject}>
                      <TableCell className="font-medium">{row.subject}</TableCell>
                      <TableCell className="text-right">{row.average}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Recent Results</CardTitle>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <div className="h-[120px] flex items-center justify-center text-muted-foreground">
                No results yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.slice(0, 10).map((r: any, idx: number) => {
                    const totalPoints = r.assessment?.totalPoints ?? 0;
                    const pct = typeof r.percentage === 'number'
                      ? r.percentage
                      : (typeof r.score === 'number' && totalPoints > 0)
                        ? Math.round((r.score / totalPoints) * 100)
                        : 0;
                    return (
                      <TableRow key={idx}>
                        <TableCell>{r.student?.name ?? 'Student'}</TableCell>
                        <TableCell>{r.assessment?.title ?? 'Assessment'}</TableCell>
                        <TableCell>{r.assessment?.subject ?? '-'}</TableCell>
                        <TableCell className="text-right">{pct}%</TableCell>
                        <TableCell className="text-right">{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
} 