'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import DashboardLayout from '@/components/layout/dashboard-layout'
import {
  ArrowRight,
  FileText,
  MessageCircle,
  Search,
  Sparkles,
  UploadCloud,
} from 'lucide-react'

const STORAGE_KEY = 'nexamind:conversations'

interface DocumentItem {
  id: string
  title: string
  type: string
  createdAt: string
}

interface RecentConversation {
  id: string
  title: string
  snippet: string
  updatedAt: string
}

const defaultActions = [
  {
    label: 'Upload un document',
    icon: UploadCloud,
    style: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
    href: '/dashboard/documents',
  },
  {
    label: 'Démarrer un chat IA',
    icon: MessageCircle,
    style: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    href: '/dashboard/chat',
  },
  {
    label: 'Rechercher dans la base de connaissances',
    icon: Search,
    style: 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    href: '/dashboard/documents',
  },
]

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const [recentConversations, setRecentConversations] = useState<RecentConversation[]>([])
  const router = useRouter()

  const handleSignOut = async () => {
    setIsSigningOut(true)
    setAuthError(null)

    const { error } = await supabase.auth.signOut()
    setIsSigningOut(false)

    if (error) {
      setAuthError(error.message)
      return
    }

    router.push('/auth/login')
  }

  const formatRelativeTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const diffMs = Date.now() - date.getTime()
    const diffMinutes = Math.floor(diffMs / 60000)

    if (diffMinutes < 1) return 'À l’instant'
    if (diffMinutes < 60) return `${diffMinutes} min`

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}h`

    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}j`
  }

  const loadRecentConversations = () => {
    if (typeof window === 'undefined') return

    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      setRecentConversations([])
      return
    }

    try {
      const parsed = JSON.parse(raw) as RecentConversation[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        setRecentConversations(parsed.slice(0, 3))
      } else {
        setRecentConversations([])
      }
    } catch {
      setRecentConversations([])
    }
  }

  const loadRecentDocuments = async () => {
    setLoadingDocuments(true)
    setDocumentsError(null)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      router.push('/auth/login')
      return
    }

    const { data, error } = await supabase
      .from('documents')
      .select('id,title,type,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3)

    setLoadingDocuments(false)

    if (error) {
      setDocumentsError(error.message)
      return
    }

    if (data) {
      setDocuments(
        data.map((item) => ({
          id: item.id,
          title: item.title,
          type: item.type,
          createdAt: item.created_at,
        }))
      )
    }
  }

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
      } else {
        setUser(user)
      }
    }

    getUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        router.push('/auth/login')
      } else {
        setUser(session.user)
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  useEffect(() => {
    loadRecentDocuments()
    loadRecentConversations()

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        loadRecentConversations()
      }
    }

    const handleFocus = () => {
      loadRecentDocuments()
      loadRecentConversations()
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', handleFocus)
    }
  }, [router])

  const displayDocuments = useMemo(() => {
    if (documents.length > 0) {
      return documents
    }
    return []
  }, [documents])

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="rounded-3xl bg-slate-900/90 px-6 py-8 shadow-xl shadow-slate-950/60">
          Chargement du dashboard...
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <section className="space-y-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-200/40 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/20">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Bienvenue sur NexaMind AI</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">Bonjour, {user.email?.split('@')[0] ?? 'Utilisateur'}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
                Suivez les performances, gérez vos documents et lancez des actions IA en un seul endroit.
              </p>
            </div>
            <div className="inline-flex items-center gap-3 rounded-3xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
              <Sparkles className="h-5 w-5 text-indigo-500" />
              IA en production · 98% de disponibilité
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.6fr_0.9fr]">
          <div className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
              <div className="rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/20">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Documents récents</p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">Derniers uploads</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard/documents')}
                    className="rounded-3xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    Voir tout
                  </button>
                </div>
                <div className="mt-6 space-y-4">
                  {loadingDocuments ? (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                      Chargement des documents...
                    </div>
                  ) : displayDocuments.length > 0 ? (
                    displayDocuments.map((doc) => (
                      <div key={doc.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-950 dark:text-white">{doc.title}</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{doc.type}</p>
                          </div>
                          <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{formatRelativeTime(doc.createdAt)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                      {documentsError
                        ? `Impossible de charger les documents : ${documentsError}`
                        : 'Aucun document récent trouvé. Téléversez un document pour démarrer.'}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/20">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Conversations IA</p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">Derniers échanges</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard/chat')}
                    className="rounded-3xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Plus
                  </button>
                </div>
                <div className="mt-6 space-y-4">
                  {recentConversations.length > 0 ? (
                    recentConversations.map((chat) => (
                      <div key={chat.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-950 dark:text-white">{chat.title}</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{chat.snippet}</p>
                          </div>
                          <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{chat.updatedAt}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                      Aucune conversation IA enregistrée pour l’instant. Lancez une discussion dans le chat pour voir l’historique.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-200/40 transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/20">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Actions rapides</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">Lancez une action IA</h2>
              <div className="mt-6 space-y-3">
                {defaultActions.map((action) => {
                  const Icon = action.icon
                  return (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => router.push(action.href)}
                      className="flex w-full items-center justify-between rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-left text-sm font-medium text-slate-900 transition hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`${action.style} inline-flex h-11 w-11 items-center justify-center rounded-3xl`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span>{action.label}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    </button>
                  )
                })}
              </div>
            </div>

          </aside>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/20">
          <p className="text-sm text-slate-600 dark:text-slate-400">Vous pouvez vous déconnecter à tout moment pour sécuriser votre accès.</p>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="inline-flex items-center justify-center rounded-3xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-300"
          >
            {isSigningOut ? 'Déconnexion...' : 'Se déconnecter'}
          </button>
          {authError ? (
            <p className="text-sm text-rose-600 dark:text-rose-300">Erreur : {authError}</p>
          ) : null}
        </div>
      </section>
    </DashboardLayout>
  )
}
