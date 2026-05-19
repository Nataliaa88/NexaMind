'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layout/dashboard-layout'
import { supabase } from '@/lib/supabase'
import { ArrowRight, CheckCircle2, Home, Loader2, Sparkles, Trash2 } from 'lucide-react'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type Conversation = {
  id: string
  title: string
  snippet: string
  updatedAt: string
  messages: Message[]
}

type SharedDocument = {
  id: string
  title: string
  type: 'PDF' | 'TXT' | 'DOCX'
  fileUrl: string | null
  createdAt: string
  content?: string
}

const STORAGE_KEY = 'nexamind:conversations'

const initialConversation: Conversation = {
  id: 'conversation-1',
  title: 'Conversation initiale',
  snippet: 'Posez votre première question pour démarrer.',
  updatedAt: 'À l’instant',
  messages: [
    {
      id: 'assistant-1',
      role: 'assistant',
      content:
        'Bonjour ! Je suis NexaMind Assistant. Je réponds à vos questions en utilisant vos documents internes et vos données métier. Posez une question pour démarrer.',
    },
  ],
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([initialConversation])
  const [activeConversationId, setActiveConversationId] = useState<string>(initialConversation.id)
  const [messages, setMessages] = useState<Message[]>(initialConversation.messages)
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isResolvingSharedDocument, setIsResolvingSharedDocument] = useState(false)
  const [sharedDocument, setSharedDocument] = useState<SharedDocument | null>(null)
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? conversations[0],
    [activeConversationId, conversations]
  )

  useEffect(() => {
    const storedConversations = window.localStorage.getItem(STORAGE_KEY)
    if (storedConversations) {
      try {
        const parsed = JSON.parse(storedConversations) as Conversation[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed)
          setActiveConversationId(parsed[0].id)
          setMessages(parsed[0].messages)
          return
        }
      } catch {
        // ignore malformed local storage
      }
    }

    setConversations([initialConversation])
    setActiveConversationId(initialConversation.id)
    setMessages(initialConversation.messages)
  }, [])

  useEffect(() => {
    const conversation = conversations.find((item) => item.id === activeConversationId)
    if (conversation) {
      setMessages(conversation.messages)
    }
  }, [activeConversationId, conversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  useEffect(() => {
    const storedSharedDocument = window.localStorage.getItem('nexamind:sharedDocument')
    if (!storedSharedDocument) return

    try {
      const parsed = JSON.parse(storedSharedDocument) as SharedDocument
      if (parsed?.title) {
        setSharedDocument(parsed)
        setInputValue(
          `Document partagé prêt pour le chat : ${parsed.title}${parsed.fileUrl ? `\n${parsed.fileUrl}` : ''}`
        )
      }
    } catch {
      // ignore malformed payload
    } finally {
      window.localStorage.removeItem('nexamind:sharedDocument')
    }
  }, [])

  const persistConversations = (nextConversations: Conversation[]) => {
    setConversations(nextConversations)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConversations))
    }
  }

  const resolveSharedDocument = async (sharedDocument?: SharedDocument | null) => {
    return sharedDocument ?? null
  }

  const sendToOpenAI = async (messagesToSend: Message[], sharedDocument?: SharedDocument | null) => {
    const resolvedSharedDocument = await resolveSharedDocument(sharedDocument)
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      throw new Error(sessionError.message)
    }

    const accessToken = sessionData?.session?.access_token
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const response = await fetch('/api/chat/ia', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({
        messages: messagesToSend.map((m) => ({ role: m.role, content: m.content })),
        sharedDocument: resolvedSharedDocument
          ? {
              id: resolvedSharedDocument.id,
              title: resolvedSharedDocument.title,
              type: resolvedSharedDocument.type,
              fileUrl: resolvedSharedDocument.fileUrl,
              createdAt: resolvedSharedDocument.createdAt,
              content: resolvedSharedDocument.content ?? '',
            }
          : undefined,
      }),
    })

    const raw = await response.text()
    const contentType = response.headers.get('content-type') ?? ''
    let data: any = null

    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(raw)
      } catch {
        throw new Error(`Réponse non JSON reçue (status: ${response.status}): ${raw}`)
      }
    } else {
      try {
        data = JSON.parse(raw)
      } catch {
        throw new Error(`Réponse non JSON reçue (status: ${response.status}): ${raw}`)
      }
    }

    if (!response.ok) {
      throw new Error(data?.error ?? `Erreur lors de l’appel IA (status: ${response.status})`)
    }

    return data.reply as string
  }

  const createNewConversation = () => {
    const newConversation: Conversation = {
      id: `conversation-${Date.now()}`,
      title: 'Nouvelle conversation',
      snippet: 'Posez une question pour démarrer.',
      updatedAt: 'À l’instant',
      messages: [
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content:
            'Bonjour ! Je suis NexaMind Assistant. Je réponds à vos questions en utilisant vos documents internes et vos données métier. Posez une question pour démarrer.',
        },
      ],
    }

    const nextConversations = [newConversation, ...conversations]
    persistConversations(nextConversations)
    setActiveConversationId(newConversation.id)
    setMessages(newConversation.messages)
    setInputValue('')
    setErrorMessage(null)
  }

  const updateCurrentConversation = (nextMessages: Message[]) => {
    const nextConversations = conversations.map((conversation) =>
      conversation.id === activeConversationId
        ? {
            ...conversation,
            messages: nextMessages,
            snippet: nextMessages.slice(-1)[0]?.content.slice(0, 120) ?? conversation.snippet,
            updatedAt: 'À l’instant',
            title:
              conversation.title === 'Nouvelle conversation' && nextMessages.length > 1
                ? nextMessages[1].content.slice(0, 40)
                : conversation.title,
          }
        : conversation
    )

    persistConversations(nextConversations)
  }

  const deleteMessage = (messageId: string) => {
    const nextMessages = messages.filter((message) => message.id !== messageId)
    setMessages(nextMessages)
    updateCurrentConversation(nextMessages)
  }

  const handleSend = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
    }

    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    updateCurrentConversation(nextMessages)
    setInputValue('')
    setErrorMessage(null)
    setIsTyping(true)
    setIsSending(true)

    try {
      const reply = await sendToOpenAI(nextMessages, sharedDocument)
      const assistantMessage: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: reply,
      }
      const finalMessages = [...nextMessages, assistantMessage]
      setMessages(finalMessages)
      updateCurrentConversation(finalMessages)
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Erreur inconnue'
      const assistantMessage: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: `Impossible de contacter l’IA : ${errorText}`,
      }
      const finalMessages = [...nextMessages, assistantMessage]
      setMessages(finalMessages)
      updateCurrentConversation(finalMessages)
      setErrorMessage(errorText)
    } finally {
      setIsTyping(false)
      setIsSending(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-200/40 backdrop-blur-sm transition dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/20">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">Chat IA</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">Conversation IA unifiée</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
                Posez une question et NexaMind consulte automatiquement vos documents internes pour répondre de façon contextualisée.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex items-center gap-2 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="inline-flex items-center gap-2 rounded-3xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                <Home className="h-4 w-4" />
                Accueil
              </button>
            </div>
          </div>
        </section>

        {sharedDocument ? (
          <section className="rounded-[2rem] border border-indigo-200 bg-indigo-50 p-6 shadow-sm shadow-slate-200/40 transition dark:border-indigo-500/20 dark:bg-indigo-950/90 dark:text-indigo-100">
            <div className="flex flex-col gap-3">
              <p className="text-sm uppercase tracking-[0.24em] text-indigo-700 dark:text-indigo-300">Document partagé</p>
              <p className="text-base font-semibold text-slate-950 dark:text-white">{sharedDocument.title}</p>
              {isResolvingSharedDocument ? (
                <div className="inline-flex items-center gap-2 rounded-3xl border border-indigo-200 bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extraction du document en cours...
                </div>
              ) : null}
              {sharedDocument.fileUrl ? (
                <a
                  href={sharedDocument.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit rounded-3xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  Ouvrir le document
                </a>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  setInputValue(
                    `Merci de consulter ce document : ${sharedDocument.title}${sharedDocument.fileUrl ? `\n${sharedDocument.fileUrl}` : ''}`
                  )
                }
                className="inline-flex w-fit rounded-3xl border border-indigo-200 bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-200 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
              >
                Insérer dans le message
              </button>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.55fr_0.85fr] min-w-0">
          <div className="flex min-h-[72vh] min-w-0 flex-col rounded-[2rem] border border-slate-200 bg-white/95 shadow-sm shadow-slate-200/40 transition dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/20">
            <div className="border-b border-slate-200 px-6 py-5 dark:border-slate-800">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Assistant contextuel</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">Vos documents internes sont pris en compte</h2>
                </div>
                <div className="inline-flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                  <Sparkles className="h-5 w-5 text-indigo-500" />
                  Contexte documentaire automatique
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden px-6 py-6">
              <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-50/80 shadow-inner dark:border-slate-800 dark:bg-slate-950/80">
                <div className="flex-1 overflow-y-auto px-5 py-5">
                  <div className="space-y-5">
                    {messages.map((message) => (
                      <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] min-w-0 break-words rounded-[2rem] border px-5 py-4 text-sm leading-6 shadow-sm transition ${
                          message.role === 'user'
                            ? 'border-indigo-200 bg-indigo-500 text-white shadow-indigo-500/10 dark:border-indigo-500/20 dark:bg-indigo-500/90'
                            : 'border-slate-200 bg-white text-slate-800 shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100'
                        }`}>
                                <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-sm">{message.role === 'user' ? 'Vous' : 'NexaMind IA'}</p>
                            {message.role === 'assistant' ? (
                              <button
                                type="button"
                                onClick={() => deleteMessage(message.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-rose-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                                aria-label="Supprimer cette réponse"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{message.content}</p>
                        </div>
                      </div>
                    ))}
                    {isTyping ? (
                      <div className="flex justify-start">
                        <div className="inline-flex max-w-[65%] break-words items-center gap-3 rounded-[2rem] border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                          <span className="text-sm text-slate-500 dark:text-slate-400">NexaMind est en train de répondre...</span>
                        </div>
                      </div>
                    ) : null}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <textarea
                      value={inputValue}
                      onChange={(event) => setInputValue(event.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Posez une question, demandez un résumé ou un guide..."
                      rows={2}
                      className="min-h-[72px] w-full resize-none rounded-3xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20"
                    />
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={isTyping || isSending || isResolvingSharedDocument || !inputValue.trim()}
                      className="inline-flex min-h-[72px] items-center justify-center rounded-3xl bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                    >
                      <ArrowRight className="h-4 w-4" />
                      Envoyer
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    Appuyez sur Entrée pour envoyer, Maj+Entrée pour saut de ligne.
                  </p>
                  {errorMessage ? (
                    <p className="mt-3 text-sm font-semibold text-rose-600 dark:text-rose-300">
                      Erreur IA : {errorMessage}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-6 min-w-0">
            <div className="rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-200/40 transition dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Historique</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">Conversations enregistrées</h2>
                </div>
                <button
                  type="button"
                  onClick={createNewConversation}
                  className="inline-flex items-center gap-2 rounded-3xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Nouvelle
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {conversations.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveConversationId(item.id)}
                    className={`w-full text-left rounded-3xl border px-4 py-4 transition ${
                      item.id === activeConversationId
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-300'
                        : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-950'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.snippet}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                        {item.updatedAt}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-slate-950/20">
              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
                <Sparkles className="h-5 w-5 text-indigo-500" />
                <p className="font-semibold">Astuce IA</p>
              </div>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
                <p>Votre assistant est connecté à vos documents internes et injecte le contexte automatiquement.</p>
                <p>Posez une question claire pour obtenir une réponse contextualisée et structurée.</p>
                <p>Les conversations sont conservées localement pour un accès rapide.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  )
}
