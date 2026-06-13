'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

export default function DemoPage() {
  const [iframeUrl, setIframeUrl] = useState('')

  const demoApiKey = process.env.NEXT_PUBLIC_DEMO_EMBED_API_KEY

  useEffect(() => {
    // This only runs on the client side
    if (demoApiKey) {
      setIframeUrl(`${window.location.origin}/embed/new?apiKey=${demoApiKey}&getFeedback=true`)
    }
  }, [demoApiKey])

  if (!demoApiKey) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <p className="text-lg font-medium text-indigo-700">Demo is not configured.</p>
        <p className="mt-2 text-sm text-indigo-500">Set NEXT_PUBLIC_DEMO_EMBED_API_KEY to enable this page.</p>
      </div>
    );
  }

  if (!iframeUrl) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="relative">
          <Loader2 className="h-16 w-16 animate-spin" />
        </div>
        <p className="mt-4 text-lg font-medium text-indigo-700 animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <div className='w-full h-screen'>
      <iframe src={iframeUrl} width="100%" height="100%" allow="microphone"></iframe>
    </div>
  );
}
