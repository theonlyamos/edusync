import { CreditsDashboard } from '@/components/credits/CreditsDashboard'

export default function CreditsPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Credits</h1>
        <p className="text-muted-foreground">
          Manage your AI learning credits. 1 Credit = 1 Minute of personalized AI tutoring.
        </p>
      </div>
      <CreditsDashboard />
    </div>
  )
}
