'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Home, FileText, MessageSquare, Search, Settings } from 'lucide-react'

const navLinks = [
  { label: 'Accueil', href: '/dashboard', icon: Home },
  { label: 'Documents', href: '/dashboard/documents', icon: FileText },
  { label: 'Chat IA', href: '/dashboard/chat', icon: MessageSquare },
  { label: 'Recherche', href: '/dashboard/search', icon: Search },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const activePath = useMemo(
    () => navLinks.find((link) => pathname?.startsWith(link.href))?.href || '/dashboard',
    [pathname]
  )

  return (
    <aside className="relative shrink-0 md:sticky md:top-0 md:z-30 md:h-screen md:self-start">
      <div className="hidden h-full md:flex">
        <div
          className={`relative flex h-full flex-col border-r border-slate-200 bg-white/95 transition-all duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-950/95 ${
            isCollapsed ? 'w-20' : 'w-[280px]'
          }`}
        >
          <div className="flex h-20 items-center justify-between gap-3 border-b border-slate-200 px-6 text-slate-900 dark:border-slate-800 dark:text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20">
                N
              </div>
              {!isCollapsed ? (
                <div>
                  <p className="text-xs uppercase leading-none tracking-[0.3em] text-slate-500 dark:text-slate-400">
                    NexaMind AI
                  </p>
                  <h1 className="mt-3 text-lg font-semibold leading-none">Dashboard</h1>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setIsCollapsed((value) => !value)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-3xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label={isCollapsed ? 'Développer la sidebar' : 'Réduire la sidebar'}
            >
              <span className="sr-only">Toggle sidebar</span>
              <div className={`h-3.5 w-3.5 rounded-full bg-slate-900 transition ${isCollapsed ? 'translate-x-0' : 'translate-x-1'}`} />
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-4">
            {navLinks.map((item) => {
              const Icon = item.icon
              const isActive = activePath === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center gap-4 rounded-3xl px-4 py-3 text-sm font-medium transition duration-200 ${
                    isActive
                      ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/10 dark:bg-indigo-500 dark:text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
                  } ${isCollapsed ? 'justify-center px-3' : ''}`}
                >
                  <Icon className="h-5 w-5" />
                  {!isCollapsed ? <span>{item.label}</span> : null}
                </Link>
              )
            })}
          </nav>

        </div>
      </div>

      <div className="md:hidden">
        <div className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-3xl bg-indigo-600 text-white">
              N
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">NexaMind AI</p>
              <p className="text-sm font-semibold text-slate-950 dark:text-white">Menu</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            className="inline-flex h-10 items-center justify-center rounded-3xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            Menu
          </button>
        </div>

        {isMobileOpen ? (
          <div className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm">
            <div className="absolute left-0 top-0 flex h-full w-[280px] flex-col bg-white shadow-2xl dark:bg-slate-950">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-3xl bg-indigo-600 text-white">
                    N
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">NexaMind AI</p>
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">Navigation</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileOpen(false)}
                  className="text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  Fermer
                </button>
              </div>

              <nav className="flex flex-col gap-1 overflow-y-auto px-4 py-4">
                {navLinks.map((item) => {
                  const Icon = item.icon
                  const isActive = activePath === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileOpen(false)}
                      className={`group flex items-center gap-4 rounded-3xl px-4 py-3 text-sm font-medium transition duration-200 ${
                        isActive
                          ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/10 dark:bg-indigo-500 dark:text-white'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
