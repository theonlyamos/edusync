'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Coins, Zap, TrendingUp, Clock, Plus } from 'lucide-react'
import axios from 'axios'

interface CreditStatus {
  credits: number
  recentTransactions: Array<{
    id: string
    credits: number
    description: string
    transaction_type: string
    created_at: string
  }>
  usageByTopic: Array<{
    topic: string
    totalCredits: number
    totalMinutes: number
    sessionCount: number
    lastUsed: string
  }>
}

const CREDIT_PACKAGES = [
  { credits: 100, price: 10.00, popular: false },
  { credits: 500, price: 50.00, popular: true },
  { credits: 1200, price: 120.00, popular: false },
  { credits: 3000, price: 300.00, popular: false },
]

export function CreditsDashboard() {
  const [status, setStatus] = useState<CreditStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [customCredits, setCustomCredits] = useState('')

  useEffect(() => {
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    try {
      const response = await axios.get('/api/credits/status')
      setStatus(response.data)
    } catch (error) {
      console.error('Failed to fetch credit status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePurchasePackage = async (credits: number) => {
    if (purchasing) return
    setPurchasing(true)
    
    try {
      const response = await axios.post('/api/credits/purchase', { credits })
      if (response.data.url) {
        window.location.href = response.data.url
      }
    } catch (error) {
      console.error('Failed to initiate purchase:', error)
      setPurchasing(false)
    }
  }

  const handleCustomPurchase = async () => {
    const credits = parseInt(customCredits)
    if (!credits || credits <= 0) return
    
    await handlePurchasePackage(credits)
  }

  const formatPrice = (price: number) => `$${price.toFixed(2)}`
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString()
  const getPricePerCredit = () => '$0.10' // Fixed price per credit

  if (loading) return <div className="flex items-center justify-center p-8">Loading credits information...</div>

  return (
    <div className="space-y-6">
      {/* Credit Balance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-yellow-500" />
            Your Credits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-4xl font-bold text-yellow-600">
                {status?.credits || 0}
              </div>
              <p className="text-sm text-muted-foreground">Available credits</p>
              <p className="text-xs text-muted-foreground mt-1">
                ≈ {status?.credits || 0} minutes of AI learning time
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground mb-2">Simple pricing:</div>
              <div className="text-lg font-semibold">1 Credit = 1 Minute</div>
              <div className="text-xs text-muted-foreground">
                All features included per minute
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Purchase Options */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {CREDIT_PACKAGES.map((pkg, index) => {
          const pricePerCredit = getPricePerCredit()
          
          return (
            <Card key={index} className={pkg.popular ? 'ring-2 ring-primary' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{pkg.credits} Credits</CardTitle>
                  {pkg.popular && <Badge variant="secondary">Popular</Badge>}
                </div>
                <div className="text-2xl font-bold">{formatPrice(pkg.price)}</div>
                <div className="text-sm text-muted-foreground">
                  ${pricePerCredit} per credit
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-xs text-muted-foreground mb-3">
                  = {pkg.credits} minutes of AI learning
                </div>
                <Button 
                  className="w-full" 
                  onClick={() => handlePurchasePackage(pkg.credits)}
                  disabled={purchasing}
                  variant={pkg.popular ? 'default' : 'outline'}
                >
                  {purchasing ? 'Processing...' : 'Buy Credits'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Custom Amount */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Custom Amount
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 max-w-lg">
            <Input
              type="number"
              placeholder="Enter credits (min 10)"
              value={customCredits}
              onChange={(e) => setCustomCredits(e.target.value)}
              min="10"
              className="flex-1"
            />
            <Button 
              onClick={handleCustomPurchase}
              disabled={purchasing || !customCredits || parseInt(customCredits) < 10}
              className="whitespace-nowrap min-w-[120px]"
            >
              Buy ${((parseInt(customCredits) || 0) * 0.10).toFixed(2)}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Custom pricing: $0.10 per credit • Minimum 10 credits
          </p>
        </CardContent>
      </Card>

      {/* Usage by Topic */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Usage by Topic
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {status?.usageByTopic?.length ? (
              status.usageByTopic.map((usage, index) => (
                <div key={index} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div className="flex-1">
                    <div className="font-medium text-sm mb-1">{usage.topic}</div>
                    <div className="text-xs text-muted-foreground">
                      {usage.sessionCount} session{usage.sessionCount !== 1 ? 's' : ''} • Last used: {formatDate(usage.lastUsed)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-red-600">-{usage.totalCredits} credits</div>
                    <div className="text-xs text-muted-foreground">{usage.totalMinutes} minutes</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8">
                No usage data yet. Start a session to see your learning topics!
              </div>
            )}
          </div>
        </CardContent>
      </Card>


      {/* Usage Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            What You Can Do
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-muted/50 rounded-lg">
              <Zap className="w-8 h-8 mx-auto mb-2 text-blue-500" />
              <div className="text-2xl font-bold">{status?.credits || 0}</div>
              <div className="text-sm text-muted-foreground">Minutes of AI Learning</div>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">∞</div>
              <div className="text-sm text-muted-foreground">Visualizations Included</div>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">∞</div>
              <div className="text-sm text-muted-foreground">Voice Interactions</div>
            </div>
          </div>
          <div className="text-center mt-4 text-sm text-muted-foreground">
            All features included • No hidden costs • Pay only for time used
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
