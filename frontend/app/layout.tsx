import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AgentLens — AI Agent Observability',
  description:
    'Real-time behavioral fingerprinting, drift detection, and simulation for AI agents. Observe, analyze, and stress-test your AI systems.',
}

function LensIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="12"
        cy="12"
        r="5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <line
        x1="19"
        y1="5"
        x2="22"
        y2="2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6">
        {/* Left: logo + nav links */}
        <div className="flex items-center gap-4 md:gap-8 min-w-0">
          <Link href="/" className="flex items-center gap-2 text-accent shrink-0">
            <LensIcon />
            <span className="text-[15px] font-semibold tracking-tight hidden xs:inline">
              AgentLens
            </span>
          </Link>

          <div className="flex items-center gap-0.5 md:gap-1">
            <Link
              href="/"
              className="rounded-md px-2 md:px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface hover:text-text whitespace-nowrap"
            >
              Agents
            </Link>
            <Link
              href="/simulations/new"
              className="rounded-md px-2 md:px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface hover:text-text whitespace-nowrap"
            >
              Simulations
            </Link>
          </div>
        </div>

        {/* Right: CTA — icon-only on mobile, full text on desktop */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border border-accent/40 px-2.5 md:px-3 py-1.5 text-[13px] font-medium text-accent transition-colors hover:border-accent hover:bg-accent/10 cursor-pointer"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="shrink-0"
            >
              <path
                d="M7 1.75V12.25M1.75 7H12.25"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span className="hidden sm:inline">Connect Agent</span>
          </button>
        </div>
      </div>
    </nav>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-text antialiased">
        <Navbar />
        <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
      </body>
    </html>
  )
}
