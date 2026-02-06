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
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              {/* Window chrome */}
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
                  <span className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
                  <span className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] text-muted-foreground">Listening</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    09:42
                  </Badge>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Active voice waveform */}
                <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Mic className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 flex items-center gap-[3px] h-8">
                    {[2, 4, 6, 3, 8, 5, 7, 4, 6, 3, 5, 8, 4, 6, 3, 7, 5, 2, 4, 6, 3, 5, 7, 4].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-primary/30 rounded-full min-w-[2px] animate-[equalizer_1.2s_ease-in-out_infinite]"
                        style={{ height: `${h * 3.5}px`, animationDelay: `${i * 0.06}s` }}
                      />
                    ))}
                  </div>
                </div>

                {/* Transcript bubble */}
                <div className="rounded-lg bg-muted/60 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Transcript</div>
                  <p className="text-sm text-foreground leading-relaxed">
                    &ldquo;Explain how neurons fire and connect in a neural network...&rdquo;
                  </p>
                </div>

                {/* Live visualization area - SVG neural network */}
                <div className="rounded-xl border bg-background relative overflow-hidden">
                  <div className="aspect-[16/9] relative">
                    <svg viewBox="0 0 480 270" fill="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                      {/* Grid dots background */}
                      <defs>
                        <pattern id="dotGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                          <circle cx="10" cy="10" r="0.6" fill="currentColor" opacity="0.1" />
                        </pattern>
                        {/* Signal pulse animation along a path */}
                        <circle id="signal" r="2.5" fill="hsl(var(--primary))" opacity="0.9">
                          <animate attributeName="opacity" values="0.9;0.3;0.9" dur="2s" repeatCount="indefinite" />
                        </circle>
                      </defs>
                      <rect width="480" height="270" fill="url(#dotGrid)" />

                      {/* ---- Connection lines (drawn first, behind nodes) ---- */}
                      {/* Input -> Hidden1 connections */}
                      {(() => {
                        const inputY = [65, 135, 205];
                        const hidden1Y = [45, 105, 165, 225];
                        const lines: React.ReactElement[] = [];
                        inputY.forEach((iy, ii) => {
                          hidden1Y.forEach((hy, hi) => {
                            const delay = (ii * 4 + hi) * 0.15;
                            lines.push(
                              <line key={`ih1-${ii}-${hi}`} x1="90" y1={iy} x2="190" y2={hy}
                                stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.12"
                              >
                                <animate attributeName="opacity" values="0.06;0.2;0.06" dur="3s" begin={`${delay}s`} repeatCount="indefinite" />
                              </line>
                            );
                          });
                        });
                        return lines;
                      })()}
                      {/* Hidden1 -> Hidden2 connections */}
                      {(() => {
                        const h1Y = [45, 105, 165, 225];
                        const h2Y = [55, 115, 175, 230];
                        const lines: React.ReactElement[] = [];
                        h1Y.forEach((y1, i1) => {
                          h2Y.forEach((y2, i2) => {
                            const delay = 0.6 + (i1 * 4 + i2) * 0.12;
                            lines.push(
                              <line key={`h1h2-${i1}-${i2}`} x1="190" y1={y1} x2="290" y2={y2}
                                stroke="hsl(var(--accent))" strokeWidth="1" opacity="0.1"
                              >
                                <animate attributeName="opacity" values="0.05;0.18;0.05" dur="2.8s" begin={`${delay}s`} repeatCount="indefinite" />
                              </line>
                            );
                          });
                        });
                        return lines;
                      })()}
                      {/* Hidden2 -> Output connections */}
                      {(() => {
                        const h2Y = [55, 115, 175, 230];
                        const outY = [100, 170];
                        const lines: React.ReactElement[] = [];
                        h2Y.forEach((y1, i1) => {
                          outY.forEach((y2, i2) => {
                            const delay = 1.2 + (i1 * 2 + i2) * 0.2;
                            lines.push(
                              <line key={`h2o-${i1}-${i2}`} x1="290" y1={y1} x2="390" y2={y2}
                                stroke="hsl(var(--foreground))" strokeWidth="1" opacity="0.08"
                              >
                                <animate attributeName="opacity" values="0.04;0.16;0.04" dur="3.2s" begin={`${delay}s`} repeatCount="indefinite" />
                              </line>
                            );
                          });
                        });
                        return lines;
                      })()}

                      {/* ---- Signal pulses travelling along select paths ---- */}
                      {[
                        { x1: 90, y1: 65, x2: 190, y2: 45, dur: '2.4s', delay: '0s' },
                        { x1: 90, y1: 135, x2: 190, y2: 165, dur: '2.8s', delay: '0.8s' },
                        { x1: 90, y1: 205, x2: 190, y2: 225, dur: '2.6s', delay: '1.5s' },
                        { x1: 190, y1: 105, x2: 290, y2: 55, dur: '2.2s', delay: '0.4s' },
                        { x1: 190, y1: 165, x2: 290, y2: 175, dur: '2.5s', delay: '1.2s' },
                        { x1: 290, y1: 115, x2: 390, y2: 100, dur: '2.3s', delay: '0.6s' },
                        { x1: 290, y1: 175, x2: 390, y2: 170, dur: '2.7s', delay: '1.8s' },
                      ].map((p, i) => (
                        <circle key={`sig-${i}`} r="2" fill="hsl(var(--primary))" opacity="0">
                          <animate attributeName="cx" values={`${p.x1};${p.x2}`} dur={p.dur} begin={p.delay} repeatCount="indefinite" />
                          <animate attributeName="cy" values={`${p.y1};${p.y2}`} dur={p.dur} begin={p.delay} repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0;0.8;0.8;0" dur={p.dur} begin={p.delay} repeatCount="indefinite" />
                        </circle>
                      ))}

                      {/* ---- Nodes (drawn last, on top) ---- */}
                      {/* Input layer */}
                      {[65, 135, 205].map((y, i) => (
                        <g key={`in-${i}`}>
                          <circle cx="90" cy={y} r="8" fill="hsl(var(--primary))" opacity="0.1">
                            <animate attributeName="opacity" values="0.08;0.18;0.08" dur="3s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
                          </circle>
                          <circle cx="90" cy={y} r="5" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="1.5">
                            <animate attributeName="r" values="5;5.8;5" dur="3s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
                          </circle>
                          <circle cx="90" cy={y} r="2" fill="hsl(var(--primary))" opacity="0.7" />
                        </g>
                      ))}
                      {/* Hidden layer 1 */}
                      {[45, 105, 165, 225].map((y, i) => (
                        <g key={`h1-${i}`}>
                          <circle cx="190" cy={y} r="7" fill="hsl(var(--accent))" opacity="0.08">
                            <animate attributeName="opacity" values="0.06;0.15;0.06" dur="2.8s" begin={`${0.3 + i * 0.4}s`} repeatCount="indefinite" />
                          </circle>
                          <circle cx="190" cy={y} r="4.5" fill="hsl(var(--card))" stroke="hsl(var(--accent))" strokeWidth="1.5">
                            <animate attributeName="r" values="4.5;5.2;4.5" dur="2.8s" begin={`${0.3 + i * 0.4}s`} repeatCount="indefinite" />
                          </circle>
                          <circle cx="190" cy={y} r="1.8" fill="hsl(var(--accent))" opacity="0.6" />
                        </g>
                      ))}
                      {/* Hidden layer 2 */}
                      {[55, 115, 175, 230].map((y, i) => (
                        <g key={`h2-${i}`}>
                          <circle cx="290" cy={y} r="7" fill="hsl(var(--accent))" opacity="0.08">
                            <animate attributeName="opacity" values="0.05;0.14;0.05" dur="3.2s" begin={`${0.6 + i * 0.35}s`} repeatCount="indefinite" />
                          </circle>
                          <circle cx="290" cy={y} r="4.5" fill="hsl(var(--card))" stroke="hsl(var(--accent))" strokeWidth="1.2">
                            <animate attributeName="r" values="4.5;5;4.5" dur="3.2s" begin={`${0.6 + i * 0.35}s`} repeatCount="indefinite" />
                          </circle>
                          <circle cx="290" cy={y} r="1.5" fill="hsl(var(--accent))" opacity="0.5" />
                        </g>
                      ))}
                      {/* Output layer */}
                      {[100, 170].map((y, i) => (
                        <g key={`out-${i}`}>
                          <circle cx="390" cy={y} r="9" fill="hsl(var(--primary))" opacity="0.08">
                            <animate attributeName="opacity" values="0.06;0.2;0.06" dur="3.5s" begin={`${1 + i * 0.6}s`} repeatCount="indefinite" />
                          </circle>
                          <circle cx="390" cy={y} r="6" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="1.8">
                            <animate attributeName="r" values="6;7;6" dur="3.5s" begin={`${1 + i * 0.6}s`} repeatCount="indefinite" />
                          </circle>
                          <circle cx="390" cy={y} r="2.5" fill="hsl(var(--primary))" opacity="0.8" />
                        </g>
                      ))}

                      {/* Layer labels */}
                      <text x="90" y="250" textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.3" fontFamily="monospace" letterSpacing="0.1em">INPUT</text>
                      <text x="190" y="250" textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.3" fontFamily="monospace" letterSpacing="0.1em">HIDDEN 1</text>
                      <text x="290" y="250" textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.3" fontFamily="monospace" letterSpacing="0.1em">HIDDEN 2</text>
                      <text x="390" y="250" textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.3" fontFamily="monospace" letterSpacing="0.1em">OUTPUT</text>
                    </svg>
                  </div>
                  <div className="px-4 py-2.5 border-t flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>4-layer neural network &middot; forward pass</span>
                    <span className="text-primary font-medium">Live</span>
                  </div>
                </div>

                {/* Status bar */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Voice session active</span>
                  <span>Auto-saving transcript</span>
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
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Voice Command</div>
                <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3 text-sm">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 2, 1, 2, 3, 4, 3, 2, 1].map((h, i) => (
                      <div
                        key={i}
                        className="w-1 bg-primary rounded-full animate-[equalizer_1s_ease-in-out_infinite]"
                        style={{ height: `${h * 4}px`, animationDelay: `${i * 0.05}s` }}
                      />
                    ))}
                  </div>
                  <span className="text-muted-foreground">"Show me how energy flows in a circuit..."</span>
                </div>
              </div>
              <div className="rounded-xl border bg-background p-4 relative overflow-hidden group">
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="aspect-video w-full rounded-lg bg-muted relative overflow-hidden">
                  {/* Abstract circuit visualization placeholder */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative w-32 h-32">
                       <div className="absolute inset-0 border-2 border-primary/20 rounded-full animate-[spin_10s_linear_infinite]" />
                       <div className="absolute inset-4 border-2 border-accent/20 rounded-full animate-[spin_8s_linear_infinite_reverse]" />
                       <div className="absolute inset-8 border-2 border-foreground/10 rounded-full" />
                       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                         <div className="w-3 h-3 bg-accent rounded-full animate-pulse shadow-[0_0_15px_hsl(var(--accent))]" />
                       </div>
                       {/* Orbiting particles */}
                       <div className="absolute inset-0 animate-[spin_4s_linear_infinite]">
                         <div className="absolute top-0 left-1/2 w-2 h-2 -ml-1 bg-primary rounded-full shadow-[0_0_10px_hsl(var(--primary))]" />
                       </div>
                    </div>
                  </div>
                  {/* Grid lines */}
                  <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Generating live visual...</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    Listening
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-4">
                <span>Audio transcribed</span>
                <span>Session #12</span>
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


