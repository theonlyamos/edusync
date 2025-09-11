'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, Coins, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function CreditsSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [credits, setCredits] = useState(0)
  
  const sessionId = searchParams.get('session_id')

  useEffect(() => {
    if (sessionId) {
      // Verify the session and get updated credit balance
      fetchUpdatedCredits()
    } else {
      setLoading(false)
    }
  }, [sessionId])

  const fetchUpdatedCredits = async () => {
    try {
      // Wait a moment for webhook to process
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const response = await fetch('/api/credits/status')
      if (response.ok) {
        const data = await response.json()
        setCredits(data.credits)
      }
    } catch (error) {
      console.error('Failed to fetch updated credits:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="text-center p-8">
            <div className="text-red-500 mb-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                ❌
              </div>
            </div>
            <h1 className="text-2xl font-bold mb-2">Invalid Session</h1>
            <p className="text-muted-foreground mb-6">
              We couldn't verify your payment session.
            </p>
            <Button asChild>
              <Link href="/credits">Back to Credits</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-blue-50">
      <Card className="max-w-md w-full shadow-xl">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl text-green-800">Payment Successful!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <div>
            <p className="text-muted-foreground mb-4">
              Your credits have been added to your account successfully.
            </p>
            
            {loading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-muted-foreground">Updating your balance...</span>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <Coins className="w-5 h-5 text-yellow-600" />
                  <span className="text-2xl font-bold text-green-800">{credits}</span>
                </div>
                <p className="text-sm text-green-700">Total Credits Available</p>
                <p className="text-xs text-muted-foreground mt-1">
                  = {credits} minutes of AI learning time
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/session" className="flex items-center justify-center space-x-2">
                <span>Start Learning</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            
            <Button variant="outline" asChild className="w-full">
              <Link href="/credits">View Credit History</Link>
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            <p>Thank you for your purchase!</p>
            <p>Receipt has been sent to your email.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
