'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

export default function DemoPage() {
  const [iframeUrl, setIframeUrl] = useState('')

  useEffect(() => {
    // This only runs on the client side
    setIframeUrl(`${window.location.origin}/embed/new?apiKey=isk_472ad9c8113b2dd06f7c225fc134b0d17ff39615a9b0b71a54830e6aeac29b9f&getFeedback=true`)
  }, [])

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
