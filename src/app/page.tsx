"use client"
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Mic, Zap, Code2, Sparkles, Play, ArrowRight, Volume2, Eye, MessageSquare, Sun, Moon } from 'lucide-react'

export default function Home() {
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
    <main className="min-h-screen overflow-x-hidden bg-gradient-to-b from-background via-indigo-50/40 to-violet-50/30 dark:from-background dark:via-indigo-950/20 dark:to-violet-950/10">
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl shadow-sm">
        <div className="container mx-auto flex h-20 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
              <Image src="/globe.svg" alt="Insyte logo" width={20} height={20} className="brightness-0 invert" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Insyte</span>
          </div>
          
          <nav className="hidden gap-8 lg:flex text-sm font-medium">
            <Link href="#features" className="text-muted-foreground hover:text-foreground transition-colors relative group">
              Features
              <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 group-hover:w-full transition-all duration-300"></div>
            </Link>
            <Link href="#demo" className="text-muted-foreground hover:text-foreground transition-colors relative group">
              Demo
              <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 group-hover:w-full transition-all duration-300"></div>
            </Link>
            <Link href="#solutions" className="text-muted-foreground hover:text-foreground transition-colors relative group">
              Solutions
              <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 group-hover:w-full transition-all duration-300"></div>
            </Link>
            <Link href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors relative group">
              Pricing
              <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 group-hover:w-full transition-all duration-300"></div>
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
            <Button asChild className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg">
              <Link href="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative container mx-auto px-4 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <Image
            src="/hero_image.jpg"
            alt="AI Visual Learning Hero"
            fill
            priority
            sizes="100vw"
            className="object-cover saturate-150 contrast-125 brightness-110"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background/20 via-background/10 " />
        </div>
        <div className="grid gap-8 py-20 md:grid-cols-2 md:gap-12">
          <div className="flex flex-col justify-center space-y-6">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-gradient-to-r from-indigo-500/10 to-violet-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200/50">
                <Sparkles className="w-3 h-3 mr-1" />
                AI-Powered Learning
              </Badge>
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 bg-clip-text text-transparent">
              Talk. Visualize. Learn.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
              Experience the future of education with <span className="font-semibold text-foreground">voice-controlled AI tutoring</span> that generates 
              <span className="font-semibold text-foreground"> interactive visualizations</span> in real-time.
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mic className="w-4 h-4 text-indigo-500" />
                Voice Streaming
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Code2 className="w-4 h-4 text-violet-500" />
                Live Code Generation
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Eye className="w-4 h-4 text-cyan-500" />
                3D Visualizations
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Button asChild size="lg" className="relative group rounded-full px-8 py-6 text-base shadow-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 hover:from-indigo-500 hover:via-violet-500 hover:to-cyan-500 text-white transition-all duration-300">
                <Link href="/session" className="flex items-center gap-2">
                  <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  Start Learning Now
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full px-6 py-6 text-base border-2 hover:bg-muted/50">
                <Link href="/signup" className="flex items-center gap-2">
                  Sign up free
                </Link>
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              ✨ No credit card required • 🎯 Works in any browser • 🚀 Instant setup
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-cyan-500/20 rounded-3xl blur-3xl"></div>
            <Card className="relative backdrop-blur-sm bg-background/80 border-2 border-gradient shadow-2xl">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">Live AI Session</h3>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-muted-foreground">Connected</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <div className="bg-primary text-primary-foreground px-4 py-2 rounded-2xl rounded-br-md max-w-[80%]">
                        Explain how neural networks work with a visual
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="bg-muted px-4 py-2 rounded-2xl rounded-bl-md max-w-[80%]">
                        I'll create an interactive visualization showing how data flows through layers...
                      </div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/50 dark:to-violet-950/50 rounded-xl p-6 border">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-medium">React Visualization</span>
                      <Code2 className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="h-8 bg-indigo-200 dark:bg-indigo-800 rounded animate-pulse"></div>
                      <div className="h-8 bg-violet-200 dark:bg-violet-800 rounded animate-pulse delay-75"></div>
                      <div className="h-8 bg-cyan-200 dark:bg-cyan-800 rounded animate-pulse delay-150"></div>
                    </div>
                    <div className="text-xs text-muted-foreground">Neural network layers processing...</div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-muted-foreground" />
                      <div className="flex gap-1">
                        {[1,2,3,4,5].map((i) => (
                          <div key={i} className={`w-1 h-4 bg-indigo-500 rounded-full ${i <= 3 ? 'animate-pulse' : 'opacity-30'}`}></div>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">9:42 remaining</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="features" className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4">
            <Zap className="w-3 h-3 mr-1" />
            Powerful Features
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need for modern learning</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Advanced AI capabilities that transform how students and teachers interact with complex concepts
          </p>
        </div>
        
        <div className="grid gap-8 md:grid-cols-3 mb-16">
          <Card className="relative overflow-hidden border-2 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all duration-300 group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-violet-500/5 group-hover:from-indigo-500/10 group-hover:to-violet-500/10 transition-all duration-300"></div>
            <CardContent className="relative p-8">
              <div className="mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center mb-4">
                  <Mic className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Real-Time Voice Streaming</h3>
                <p className="text-muted-foreground mb-4">
                  Talk naturally with AI that understands context, generates responses, and creates visualizations based on your voice commands.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    Natural conversation
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    Hands-free learning
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    Progress tracking
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-2 hover:border-violet-200 dark:hover:border-violet-800 transition-all duration-300 group">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-cyan-500/5 group-hover:from-violet-500/10 group-hover:to-cyan-500/10 transition-all duration-300"></div>
            <CardContent className="relative p-8">
              <div className="mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center mb-4">
                  <Code2 className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Interactive Visualizations</h3>
                <p className="text-muted-foreground mb-4">
                  Watch as AI creates interactive visualizations and animations tailored to explain complex concepts clearly.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-2 h-2 bg-violet-500 rounded-full"></div>
                    Interactive diagrams
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    Animated simulations
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    3D visualizations
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-2 hover:border-cyan-200 dark:hover:border-cyan-800 transition-all duration-300 group">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-indigo-500/5 group-hover:from-cyan-500/10 group-hover:to-indigo-500/10 transition-all duration-300"></div>
            <CardContent className="relative p-8">
              <div className="mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-500 flex items-center justify-center mb-4">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Intelligent Chat Interface</h3>
                <p className="text-muted-foreground mb-4">
                  Seamlessly switch between voice and text, with a focused chat panel that captures explanations and guides learning.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                    Context-aware responses
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-2 h-2 bg-violet-500 rounded-full"></div>
                    Visual feedback loop
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                    Session continuity
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Learning benefits showcase */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/20 dark:to-violet-950/20">
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">Instant</div>
            <div className="text-sm text-muted-foreground">Get immediate visual explanations for any concept</div>
          </div>
          <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-violet-50 to-cyan-50 dark:from-violet-950/20 dark:to-cyan-950/20">
            <div className="text-2xl font-bold text-violet-600 dark:text-violet-400 mb-2">Adaptive</div>
            <div className="text-sm text-muted-foreground">AI adjusts to your learning style and pace</div>
          </div>
          <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-cyan-50 to-indigo-50 dark:from-cyan-950/20 dark:to-indigo-950/20">
            <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-2">Engaging</div>
            <div className="text-sm text-muted-foreground">Interactive content keeps you focused and motivated</div>
          </div>
          <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/20 dark:to-violet-950/20">
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">Effective</div>
            <div className="text-sm text-muted-foreground">Visual learning improves comprehension and retention</div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="relative container mx-auto px-4 py-24 overflow-hidden">
        <div className="absolute inset-0 -z-10">
           <Image
             src="/hero_image.jpg"
             alt="AI Learning Demo Background"
             fill
             sizes="100vw"
             className="object-cover saturate-150 contrast-125 brightness-110 scale-x-[-1]"
           />
          <div className="absolute inset-0 bg-gradient-to-br from-background/80 via-background/60 to-background/80" />
        </div>
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4">
            <Play className="w-3 h-3 mr-1" />
            See it in Action
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Experience AI-powered learning</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Watch how students interact with complex topics through voice and receive instant visual feedback
          </p>
          <Button asChild size="lg" className="rounded-full px-8 py-6 text-base shadow-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white">
            <Link href="/session" className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              Try Live Demo
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-8 lg:grid-cols-2 items-center">
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold">How it works</h3>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                    <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">1</span>
                  </div>
                  <div>
                    <h4 className="font-semibold">Start a voice session</h4>
                    <p className="text-sm text-muted-foreground">Click "Start Learning" and grant microphone access for real-time interaction</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                    <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">2</span>
                  </div>
                  <div>
                    <h4 className="font-semibold">Ask questions naturally</h4>
                    <p className="text-sm text-muted-foreground">Speak your questions or type them - AI understands context and learning goals</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-100 dark:bg-cyan-900 flex items-center justify-center">
                    <span className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">3</span>
                  </div>
                  <div>
                    <h4 className="font-semibold">Get visual explanations</h4>
                    <p className="text-sm text-muted-foreground">Watch as AI generates interactive code and visualizations to explain concepts</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-cyan-500/10 rounded-2xl blur-2xl"></div>
            <Card className="relative backdrop-blur-sm bg-background/95 border-2 shadow-2xl">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b">
                    <span className="text-sm font-medium">Live Demo Session</span>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-muted-foreground">Recording</span>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <div className="bg-primary text-primary-foreground px-3 py-2 rounded-2xl rounded-br-md max-w-[85%] text-sm">
                        How do neural networks work? Can you show me?
                      </div>
                    </div>
                    
                    <div className="flex justify-start">
                      <div className="bg-muted px-3 py-2 rounded-2xl rounded-bl-md max-w-[85%] text-sm">
                        I'll create an interactive visualization showing how artificial neurons work together...
                      </div>
                    </div>
                  </div>

                  <div className="relative rounded-xl overflow-hidden border shadow-lg">
                    <Image
                      src="/visualization_example.jpg"
                      alt="Neural Networks Explained - Interactive Learning Visualization"
                      width={400}
                      height={300}
                      className="w-full h-auto object-cover"
                      priority
                    />
                    <div className="absolute top-3 right-3">
                      <Badge variant="secondary" className="bg-white/90 text-violet-700 text-xs">
                        Live Visualization
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-3 h-3 text-muted-foreground" />
                      <div className="flex gap-1">
                        {[1,2,3,4].map((i) => (
                          <div key={i} className={`w-1 h-3 bg-indigo-500 rounded-full ${i <= 2 ? 'animate-pulse' : 'opacity-30'}`}></div>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">Learning in progress</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="solutions" className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for every learner</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Tailored experiences for students, teachers, and administrators
          </p>
        </div>
        
        <div className="grid gap-8 md:grid-cols-3">
          <Card className="relative overflow-hidden border-2 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all duration-300 group">
            <Link href="/session" className="block">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-violet-500/5 group-hover:from-indigo-500/10 group-hover:to-violet-500/10 transition-all duration-300"></div>
              <CardContent className="relative p-8">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center mb-6">
                  <Eye className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-3">For Learners</h3>
                <p className="text-muted-foreground mb-4">
                  Personalized, visual-first learning with interactive practice sessions and real-time feedback.
                </p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>• Voice-guided tutorials</div>
                  <div>• Interactive visualizations</div>
                  <div>• Progress tracking</div>
                </div>
                <div className="flex items-center gap-2 mt-6 text-indigo-600 dark:text-indigo-400 font-medium">
                  Start learning now
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </CardContent>
            </Link>
          </Card>

          <Card className="relative overflow-hidden border-2 border-dashed border-violet-200 dark:border-violet-800 transition-all duration-300 opacity-75">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-cyan-500/5"></div>
            <CardContent className="relative p-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/50 to-cyan-500/50 flex items-center justify-center mb-6">
                <Sparkles className="w-6 h-6 text-violet-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">For Teachers</h3>
              <p className="text-muted-foreground mb-4">
                Plan lessons, generate content, and deliver live visual explanations that engage every student.
              </p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>• Lesson planning tools</div>
                <div>• Content generation</div>
                <div>• Student analytics</div>
              </div>
              <div className="flex items-center gap-2 mt-6">
                <Badge variant="outline" className="bg-gradient-to-r from-violet-50 to-cyan-50 dark:from-violet-950/50 dark:to-cyan-950/50 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800">
                  Coming Soon
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-2 border-dashed border-cyan-200 dark:border-cyan-800 transition-all duration-300 opacity-75">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-indigo-500/5"></div>
            <CardContent className="relative p-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/50 to-indigo-500/50 flex items-center justify-center mb-6">
                <Zap className="w-6 h-6 text-cyan-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">For Admins</h3>
              <p className="text-muted-foreground mb-4">
                Manage users, grades, timetables, and get school-wide insights into learning outcomes.
              </p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>• User management</div>
                <div>• Performance analytics</div>
                <div>• System administration</div>
              </div>
              <div className="flex items-center gap-2 mt-6">
                <Badge variant="outline" className="bg-gradient-to-r from-cyan-50 to-indigo-50 dark:from-cyan-950/50 dark:to-indigo-950/50 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800">
                  Coming Soon
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="pricing" className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to transform learning?</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Join thousands of students and teachers already using AI-powered visual learning
          </p>
        </div>
        
        <div className="relative max-w-4xl mx-auto">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-cyan-500/20 rounded-3xl blur-3xl"></div>
          <Card className="relative backdrop-blur-sm bg-background/90 border-2 border-gradient shadow-2xl">
            <CardContent className="p-12 text-center">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-100 to-violet-100 dark:from-indigo-900/50 dark:to-violet-900/50 px-4 py-2 rounded-full mb-6">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Free to start</span>
              </div>
              
              <h3 className="text-3xl font-bold mb-4">Start free, upgrade when you grow</h3>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                All core features included. No credit card required. Experience the future of education today.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
                <Button asChild size="lg" className="relative group rounded-full px-8 py-6 text-base shadow-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 hover:from-indigo-500 hover:via-violet-500 hover:to-cyan-500 text-white transition-all duration-300">
                  <Link href="/session" className="flex items-center gap-2">
                    <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    Try Live Demo
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full px-8 py-6 text-base border-2 hover:bg-muted/50">
                  <Link href="/signup" className="flex items-center gap-2">
                    Sign up free
                  </Link>
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                <div>
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-1">✨</div>
                  <div className="text-sm text-muted-foreground">No credit card required</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-violet-600 dark:text-violet-400 mb-1">🚀</div>
                  <div className="text-sm text-muted-foreground">Instant setup in seconds</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-1">🎯</div>
                  <div className="text-sm text-muted-foreground">Works in any browser</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="border-t bg-gradient-to-br from-indigo-50/30 to-violet-50/20 dark:from-indigo-950/10 dark:to-violet-950/10">
        <div className="container mx-auto px-4 py-16">
          <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">
            {/* Brand Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
                  <Image src="/globe.svg" alt="Insyte logo" width={20} height={20} className="brightness-0 invert" />
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Insyte</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Transforming education through AI-powered visual learning experiences that make complex concepts simple and engaging.
              </p>
              <div className="flex items-center gap-3">
                <Button asChild size="sm" className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white">
                  <Link href="/session">Try Demo</Link>
                </Button>
              </div>
            </div>

            {/* Product Links */}
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground">Product</h3>
              <div className="space-y-3">
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
            </div>

            {/* User Types */}
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground">For Everyone</h3>
              <div className="space-y-3">
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
            </div>

            {/* Get Started */}
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground">Get Started</h3>
              <div className="space-y-3">
                <Link href="/signup" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Create Account
                </Link>
                <Link href="/login" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Sign In
                </Link>
                <div className="pt-2">
                  <div className="text-xs text-muted-foreground mb-2">Start learning today</div>
                  <div className="text-xs text-muted-foreground">✨ Free • 🚀 Instant • 🎯 No setup required</div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="border-t pt-8 mt-12 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Insyte. All rights reserved. Powered by AI for visual learning.
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
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


