"use client"
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Mic, Code2, Play, ArrowRight, MessageSquare, Sun, Moon } from 'lucide-react'

function HomeContent() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')

  // Theme toggle state (default to dark)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    // On mount, read saved theme or default to dark
    const saved = typeof window !== 'undefined' && localStorage.getItem('theme')
    const initial = (saved === 'light' || saved === 'dark') ? saved : 'dark'
    setTheme(initial)
    document.documentElement.classList.toggle('dark', initial === 'dark')
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }

  if (code) {
    return (
      <main className="min-h-screen overflow-x-hidden flex items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-sm text-muted-foreground">Signing you in...</div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background bg-[radial-gradient(circle_at_20%_20%,rgba(92,74,46,0.08),transparent_55%),radial-gradient(circle_at_85%_10%,rgba(28,74,60,0.08),transparent_45%)]">
      <header className="sticky top-0 z-50 w-full border-b bg-background/90 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md border bg-card flex items-center justify-center">
              <Image src="/globe.svg" alt="InsyteAI logo" width={18} height={18} className="opacity-80" />
            </div>
            <span className="text-lg font-semibold tracking-tight">InsyteAI</span>
          </div>

          <nav className="hidden gap-8 lg:flex text-sm">
            <Link href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#demo" className="text-muted-foreground hover:text-foreground transition-colors">
              Demo
            </Link>
            <Link href="#solutions" className="text-muted-foreground hover:text-foreground transition-colors">
              Solutions
            </Link>
            <Link href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="inline-flex"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="bg-primary/10 text-foreground border border-primary/30 hover:bg-primary/20">
              <Link href="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div className="flex flex-col gap-6">
            <div className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
              InsyteAI Visual Studio
            </div>
            <h1 className="text-4xl md:text-6xl leading-[1.05]">
              Visual learning, reimagined.
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              A voice-first learning environment where complex ideas turn into live,
              clear visuals. Built for modern classrooms and curious minds.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Voice-led sessions
              </span>
              <span className="inline-flex items-center gap-2">
                <Code2 className="h-4 w-4" />
                Live visualizations
              </span>
              <span className="inline-flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Context-aware tutoring
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Button asChild size="lg" className="px-8 py-6 text-base whitespace-nowrap bg-primary/10 text-foreground border border-primary/30 hover:bg-primary/20">
                <Link href="/demo" className="flex items-center gap-2">
                  <Play className="w-5 h-5" />
                  Start a live session
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-8 py-6 text-base whitespace-nowrap">
                <Link href="/signup">Create a free account</Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-6 pt-4 text-sm text-muted-foreground">
              <div>
                <div className="text-2xl font-semibold text-foreground">120+ hours</div>
                of guided learning sessions
              </div>
              <div>
                <div className="text-2xl font-semibold text-foreground">20k+</div>
                interactive visuals generated
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between border-b pb-3 mb-4">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Studio Session
                </span>
                <Badge variant="secondary" className="text-xs">
                  Live
                </Badge>
              </div>
              <Image
                src="/hero_image_1.jpg"
                alt="Interactive learning session preview"
                width={560}
                height={420}
                className="rounded-xl border object-cover"
                priority
              />
              <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Visual explanation: Neural pathways</span>
                  <span>09:42</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Teacher notes captured</span>
                  <span>Auto-saved</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="container mx-auto px-4 py-20">
        <div className="flex flex-col gap-4 max-w-3xl">
          <Badge variant="outline" className="w-fit">Feature set</Badge>
          <h2 className="text-3xl md:text-4xl leading-tight">
            Crafted for real classrooms, not just demos.
          </h2>
          <p className="text-lg text-muted-foreground">
            Every tool is designed to keep learners engaged while educators stay in control.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mt-10">
          {[
            {
              title: 'Voice-driven lessons',
              description: 'Speak naturally and see concepts unfold as visual diagrams.',
              icon: <Mic className="h-5 w-5" />,
            },
            {
              title: 'Live visualization engine',
              description: 'Generate clear, interactive visuals in the moment.',
              icon: <Code2 className="h-5 w-5" />,
            },
            {
              title: 'Guided chat companion',
              description: 'Summaries, next steps, and follow-ups are captured automatically.',
              icon: <MessageSquare className="h-5 w-5" />,
            },
          ].map((feature) => (
            <div key={feature.title} className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-3 text-sm uppercase tracking-[0.2em] text-muted-foreground">
                {feature.icon}
                Feature
              </div>
              <h3 className="mt-4 text-xl font-semibold">{feature.title}</h3>
              <p className="mt-3 text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="demo" className="container mx-auto px-4 py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div className="space-y-5">
            <Badge variant="outline" className="w-fit">Live demo</Badge>
            <h2 className="text-3xl md:text-4xl leading-tight">
              Watch a session unfold in real time.
            </h2>
            <p className="text-lg text-muted-foreground">
              Students talk through a topic. The visual layer responds instantly,
              creating an experience that feels closer to a studio than a lecture.
            </p>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="text-foreground font-semibold">1.</span>
                Start a voice session and set the learning goal.
              </div>
              <div className="flex items-center gap-3">
                <span className="text-foreground font-semibold">2.</span>
                Ask questions as the system builds visuals.
              </div>
              <div className="flex items-center gap-3">
                <span className="text-foreground font-semibold">3.</span>
                Export notes and visuals for later review.
              </div>
            </div>
            <Button asChild size="lg" className="px-8 py-6 text-base bg-primary/10 text-foreground border border-primary/30 hover:bg-primary/20">
              <Link href="/demo" className="flex items-center gap-2">
                <Play className="w-5 h-5" />
                Open the live demo
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>

          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b px-4 py-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-foreground/30"></span>
                <span className="h-2 w-2 rounded-full bg-foreground/30"></span>
                <span className="h-2 w-2 rounded-full bg-foreground/30"></span>
              </div>
              <span className="ml-auto">Session 12 · Physics</span>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Prompt</div>
                <div className="rounded-lg border bg-background px-4 py-3 text-sm">
                  Explain how energy flows through a circuit and visualize it.
                </div>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <Image
                  src="/visualization_example.jpg"
                  alt="Visualization example"
                  width={520}
                  height={320}
                  className="rounded-lg object-cover"
                />
                <div className="mt-3 text-xs text-muted-foreground">Generated visualization · 12 seconds</div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Notes saved to session log</span>
                <span>Auto-sync enabled</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="solutions" className="container mx-auto px-4 py-20">
        <div className="flex flex-col gap-4 max-w-3xl">
          <Badge variant="outline" className="w-fit">Solutions</Badge>
          <h2 className="text-3xl md:text-4xl leading-tight">
            Designed for every learning role.
          </h2>
          <p className="text-lg text-muted-foreground">
            From students to administrators, each workspace is tailored to the way they teach or learn.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mt-10">
          <Link href="/learn" className="rounded-xl border bg-card p-6 shadow-sm hover:border-foreground/40 transition-colors">
            <h3 className="text-xl font-semibold">For Learners</h3>
            <p className="mt-3 text-muted-foreground">
              Focused sessions, instant visuals, and personalized practice pathways.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm text-foreground">
              Start learning
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h3 className="text-xl font-semibold">For Teachers</h3>
            <p className="mt-3 text-muted-foreground">
              Lesson prep, live delivery tools, and student insights in one place.
            </p>
            <Badge variant="secondary" className="mt-6">Coming soon</Badge>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h3 className="text-xl font-semibold">For Admins</h3>
            <p className="mt-3 text-muted-foreground">
              Manage classrooms, track progress, and support school-wide outcomes.
            </p>
            <Badge variant="secondary" className="mt-6">Coming soon</Badge>
          </div>
        </div>
      </section>

      <section id="pricing" className="container mx-auto px-4 py-20">
        <div className="rounded-2xl border bg-card p-10 md:p-14 text-center">
          <Badge variant="outline" className="mb-4">Pricing</Badge>
          <h2 className="text-3xl md:text-4xl leading-tight">
            Start free, scale when you are ready.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to run modern lessons, with no credit card required to begin.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="px-8 py-6 text-base bg-primary/10 text-foreground border border-primary/30 hover:bg-primary/20">
              <Link href="/learn" className="flex items-center gap-2">
                <Play className="w-5 h-5" />
                Try the live demo
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="px-8 py-6 text-base">
              <Link href="/signup">Create free account</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="container mx-auto px-4 py-14">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md border bg-card flex items-center justify-center">
                  <Image src="/globe.svg" alt="InsyteAI logo" width={18} height={18} className="opacity-80" />
                </div>
                <span className="text-lg font-semibold tracking-tight">InsyteAI</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A visual learning platform built for clarity, focus, and real student outcomes.
              </p>
              <Button asChild size="sm" className="bg-primary/10 text-foreground border border-primary/30 hover:bg-primary/20">
                <Link href="/learn">Try Demo</Link>
              </Button>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">Product</h3>
              <Link href="#features" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Features
              </Link>
              <Link href="#demo" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Live Demo
              </Link>
              <Link href="#solutions" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Solutions
              </Link>
              <Link href="#pricing" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Pricing
              </Link>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">For Everyone</h3>
              <Link href="/students/dashboard" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Students
              </Link>
              <Link href="/teachers/dashboard" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Teachers
              </Link>
              <Link href="/admin/dashboard" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Administrators
              </Link>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">Get Started</h3>
              <Link href="/signup" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Create Account
              </Link>
              <Link href="/login" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Sign In
              </Link>
              <div className="pt-2 text-xs text-muted-foreground">
                Start learning today with a free account.
              </div>
            </div>
          </div>

          <div className="border-t pt-8 mt-10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <div>© {new Date().getFullYear()} InsyteAI. All rights reserved.</div>
            <div className="flex items-center gap-6">
              <span>Privacy</span>
              <span>Terms</span>
              <span>Support</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <main className="min-h-screen overflow-x-hidden flex items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </main>
    }>
      <HomeContent />
    </Suspense>
  )
}


