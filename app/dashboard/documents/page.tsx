'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layout/dashboard-layout'
import { supabase } from '@/lib/supabase'
import {
  CalendarDays,
  FileText,
  LayoutGrid,
  LayoutList,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react'

type DocumentType = 'PDF' | 'TXT' | 'DOCX'

type DocumentItem = {
  id: string
  title: string
  type: DocumentType
  createdAt: string
  size: string
  fileUrl: string | null
  storagePath: string | null
  content: string
}

type SupabaseDocumentRow = {
  id: string
  user_id: string
  title: string
  type: DocumentType
  size: string
  storage_path: string | null
  file_url: string | null
  content: string
  created_at: string
}

const badgeStyles: Record<DocumentType | 'DEFAULT', string> = {
  PDF: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  DOCX: 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  TXT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  DEFAULT: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

const getTypeBadge = (type: DocumentType) => badgeStyles[type] ?? badgeStyles.DEFAULT

const processEnv = process as any
const STORAGE_BUCKET = processEnv.env?.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'documents'

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const filteredDocuments = useMemo(
    () =>
      documents.filter((document) => {
        const query = search.toLowerCase()
        return (
          document.title.toLowerCase().includes(query) ||
          document.type.toLowerCase().includes(query) ||
          (document.fileUrl ?? '').toLowerCase().includes(query)
        )
      }),
    [documents, search]
  )

  const formatSupabaseError = (error: unknown): string => {
    if (!error) return 'Erreur inconnue.'
    if (error instanceof Error) return error.message
    if (typeof error === 'object' && error !== null) {
      const record = error as Record<string, unknown>
      if (typeof record.message === 'string') return record.message
      if (typeof record.error === 'string') return record.error
      if (typeof record.details === 'string') return record.details
    }
    return 'Erreur inconnue.'
  }

  const getPublicUrlForPath = (path: string | null | undefined): string | null => {
    if (!path) return null
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
    return data?.publicUrl ?? null
  }

  const ALLOWED_FILE_TYPES: Record<string, DocumentType> = {
  'application/pdf': 'PDF',
  'text/plain': 'TXT',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
}

const getDocumentType = (file: File): DocumentType | null => {
  if (ALLOWED_FILE_TYPES[file.type]) {
    return ALLOWED_FILE_TYPES[file.type]
  }

  const extension = file.name.split('.').pop()?.toUpperCase() ?? ''
  if (extension === 'PDF') return 'PDF'
  if (extension === 'TXT') return 'TXT'
  if (extension === 'DOCX') return 'DOCX'

  return null
}

const isValidDocumentFile = (file: File): file is File => {
  return getDocumentType(file) !== null
}

const getUserFriendlyTypeError = () =>
  'Format non supporté. Seuls les fichiers PDF, TXT et DOCX sont autorisés.'

  const fetchDocuments = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!user) throw new Error('Veuillez vous reconnecter pour charger vos documents.')

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!data) {
        setDocuments([])
      } else {
        const documentsData = data as SupabaseDocumentRow[]
        setDocuments(
          documentsData.map((item) => ({
            id: item.id,
            title: item.title,
            type: item.type,
            createdAt: item.created_at,
            size: item.size,
            storagePath: item.storage_path,
            fileUrl: item.file_url ?? getPublicUrlForPath(item.storage_path),
            content: item.content ?? '',
          }))
        )
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur lors du chargement des documents.')
    } finally {
      setIsLoading(false)
    }
  }

  const getAuthHeaders = async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      throw error
    }

    const token = data?.session?.access_token
    if (!token) {
      throw new Error('Session utilisateur introuvable. Veuillez vous reconnecter.')
    }

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  const extractDocumentContent = async (documentId: string) => {
    const headers = await getAuthHeaders()
    const response = await fetch('/api/documents/extract', {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentId }),
    })

    if (!response.ok) {
      const { error } = await response.json().catch(() => ({ error: 'Extraction interrompue' }))
      throw new Error(error || 'Extraction du document échouée.')
    }

    const result = await response.json()
    return result.extractedText as string
  }

  const ingestDocument = async (documentId: string) => {
    const headers = await getAuthHeaders()
    const response = await fetch('/api/documents/ingest', {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentId }),
    })

    if (!response.ok) {
      const { error } = await response.json().catch(() => ({ error: 'Ingestion interrompue' }))
      throw new Error(error || 'Ingestion du document échouée.')
    }

    return response.json()
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  const handleUploadClick = () => fileInputRef.current?.click()

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!user) throw new Error('Veuillez vous reconnecter pour télécharger un document.')

      const type = getDocumentType(file)
      if (!type) {
        throw new Error(getUserFriendlyTypeError())
      }

      const fileName = `${crypto.randomUUID()}-${file.name}`
      const storagePath = `${user.id}/${fileName}`

      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
        upsert: false,
      })

      if (uploadError) {
        if (uploadError.message?.includes('Bucket not found')) {
          throw new Error(
            `Bucket '${STORAGE_BUCKET}' introuvable. Créez-le dans Supabase Storage ou ajustez NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET.`
          )
        }
        throw uploadError
      }

      const fileUrl = getPublicUrlForPath(storagePath)
      if (!fileUrl) {
        throw new Error('Impossible de générer l’URL publique du document.')
      }

      const createdAt = new Date().toISOString()
      const size = `${Math.max(1, Math.round(file.size / 1024))} KB`

      const { data: insertedData, error: insertError } = await supabase
        .from('documents')
        .insert([
          {
            user_id: user.id,
            title: file.name,
            type,
            size,
            storage_path: storagePath,
            file_url: fileUrl,
            content: '',
            created_at: createdAt,
          },
        ])
        .select('id,title,type,size,storage_path,file_url,content,created_at')
        .single()

      if (insertError) throw insertError

      const newDocument: DocumentItem = {
        id: insertedData.id,
        title: insertedData.title,
        type: insertedData.type,
        createdAt: insertedData.created_at,
        size: insertedData.size,
        fileUrl: insertedData.file_url,
        storagePath: insertedData.storage_path,
        content: insertedData.content ?? '',
      }

      setDocuments((current) => [newDocument, ...current])

      try {
        const extractedText = await extractDocumentContent(insertedData.id)
        setDocuments((current) =>
          current.map((item) =>
            item.id === insertedData.id ? { ...item, content: extractedText } : item
          )
        )

        try {
          await ingestDocument(insertedData.id)
        } catch (ingestError) {
          console.warn('Ingestion des chunks en arrière-plan échouée :', ingestError)
        }
      } catch (extractionError) {
        console.warn('Extraction du texte en arrière-plan échouée :', extractionError)
        setErrorMessage(`Le document a été uploadé mais l'extraction a échoué : ${formatSupabaseError(extractionError)}`)
      }
    } catch (error) {
      console.error('Erreur lors du téléchargement:', error)
      setErrorMessage(`Erreur lors du téléchargement du document : ${formatSupabaseError(error)}`)
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setIsLoading(false)
    }
  }

  const router = useRouter()

  const handleShareToChat = (document: DocumentItem) => {
    const documentPayload = {
      id: document.id,
      title: document.title,
      fileUrl: document.fileUrl,
      type: document.type,
      createdAt: document.createdAt,
      content: document.content ?? '',
    }

    window.localStorage.setItem('nexamind:sharedDocument', JSON.stringify(documentPayload))
    router.push('/dashboard/chat')
  }

  const handleDelete = async (id: string) => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const documentToDelete = documents.find((document) => document.id === id)
      if (!documentToDelete) throw new Error('Document introuvable.')

      const { error: deleteError } = await supabase.from('documents').delete().eq('id', id)
      if (deleteError) throw deleteError

      if (documentToDelete.storagePath) {
        await supabase.storage.from(STORAGE_BUCKET).remove([documentToDelete.storagePath])
      }

      setDocuments((current) => current.filter((document) => document.id !== id))
    } catch (error) {
      setErrorMessage(`Erreur lors de la suppression : ${formatSupabaseError(error)}`)
    } finally {
      setIsLoading(false)
    }
  }

  const documentCount = filteredDocuments.length

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-200/40 backdrop-blur-sm transition dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/20">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Documents</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">Bibliothèque de documents</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
                Gérez vos fichiers IA, recherchez rapidement des contenus, et basculez entre un affichage liste et grille de façon fluide.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="inline-flex items-center rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                <span className="mr-3 rounded-2xl bg-indigo-500/10 px-2 py-1 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                  {documents.length}
                </span>
                Documents disponibles
              </div>
              <button
                type="button"
                onClick={handleUploadClick}
                className="inline-flex items-center gap-2 rounded-3xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                <UploadCloud className="h-4 w-4" />
                Upload
              </button>
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/10 dark:text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white/95 p-5 shadow-sm shadow-slate-200/40 transition dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/20 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher un document, type ou URL"
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 py-4 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`inline-flex h-12 w-12 items-center justify-center rounded-3xl border text-slate-700 transition ${
                    viewMode === 'grid'
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-300'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                  aria-label="Afficher en grille"
                >
                  <LayoutGrid className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex h-12 w-12 items-center justify-center rounded-3xl border text-slate-700 transition ${
                    viewMode === 'list'
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-300'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                  aria-label="Afficher en liste"
                >
                  <LayoutList className="h-5 w-5" />
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="rounded-[2rem] border border-slate-200 bg-white/95 p-10 text-center text-slate-700 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-950/95 dark:text-slate-200">
                Chargement des documents...
              </div>
            ) : documentCount === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <FileText className="h-7 w-7" />
                </div>
                <h2 className="mt-6 text-2xl font-semibold text-slate-950 dark:text-white">Aucun document trouvé</h2>
                <p className="mt-3 max-w-xl mx-auto text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Téléversez vos premiers documents ou utilisez la recherche pour retrouver rapidement un fichier existant.
                </p>
                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="mt-6 inline-flex items-center gap-2 rounded-3xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                  <UploadCloud className="h-4 w-4" />
                  Upload un document
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredDocuments.map((document) => (
                  <article
                    key={document.id}
                    className="group rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40 transition duration-200 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/95 dark:hover:border-indigo-500 dark:hover:shadow-slate-950/40"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] ${getTypeBadge(document.type)}`}>
                          {document.type}
                        </span>
                        <h2 className="mt-5 text-lg font-semibold text-slate-950 dark:text-white truncate">{document.title}</h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(document.id)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                        aria-label={`Supprimer ${document.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-6 flex flex-col gap-4 text-sm text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        <span>{formatDate(document.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span>{document.size}</span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {document.fileUrl ? (
                          <a
                            href={document.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-3xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700"
                          >
                            Ouvrir
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleShareToChat(document)}
                          className="inline-flex items-center rounded-3xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 hover:text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
                        >
                          Envoyer au chat
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredDocuments.map((document) => (
                  <div
                    key={document.id}
                    className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 transition duration-200 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/95 dark:hover:border-indigo-500 dark:hover:shadow-slate-950/40"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-3xl bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          <FileText className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] ${getTypeBadge(document.type)}`}>
                            {document.type}
                          </span>
                          <h3 className="mt-3 max-w-[28rem] truncate text-xl font-semibold text-slate-950 dark:text-white">{document.title}</h3>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                        <div className="inline-flex items-center gap-2 rounded-3xl bg-slate-100 px-3 py-2 dark:bg-slate-900">
                          <CalendarDays className="h-4 w-4" />
                          {formatDate(document.createdAt)}
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-3xl bg-slate-100 px-3 py-2 dark:bg-slate-900">
                          <FileText className="h-4 w-4" />
                          {document.size}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleShareToChat(document)}
                          className="inline-flex h-12 items-center justify-center rounded-3xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 hover:text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
                        >
                          Envoyer au chat
                        </button>
                        {document.fileUrl ? (
                          <a
                            href={document.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-12 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700"
                          >
                            Ouvrir
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleDelete(document.id)}
                          className="inline-flex h-12 items-center justify-center rounded-3xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-200/40 transition dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/20">
              <p className="text-sm uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Votre bibliothèque</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">Résumé documents</h2>
              <div className="mt-6 space-y-4 text-sm text-slate-600 dark:text-slate-400">
                <div className="flex items-center justify-between rounded-3xl bg-slate-50 px-4 py-4 dark:bg-slate-900">
                  <span>Documents totaux</span>
                  <strong className="text-slate-950 dark:text-white">{documents.length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-3xl bg-slate-50 px-4 py-4 dark:bg-slate-900">
                  <span>Type le plus fréquent</span>
                  <strong className="text-slate-950 dark:text-white">PDF</strong>
                </div>
                <div className="flex items-center justify-between rounded-3xl bg-slate-50 px-4 py-4 dark:bg-slate-900">
                  <span>Dernier upload</span>
                  <strong className="text-slate-950 dark:text-white">{documents[0] ? formatDate(documents[0].createdAt) : '—'}</strong>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-slate-950/20">
              <p className="text-sm uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Conseils</p>
              <div className="mt-5 space-y-4 text-sm leading-6 text-slate-600 dark:text-slate-400">
                <p>Utilisez la recherche pour retrouver vos documents plus vite.</p>
                <p>Supprimez les fichiers obsolètes pour garder une bibliothèque claire et organisée.</p>
                <p>Choisissez l’affichage liste pour gérer rapidement vos actions.</p>
              </div>
            </div>
          </aside>
        </section>
      </div>

      <input
        id="document-upload-input"
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.docx"
        className="sr-only"
        onChange={handleFileChange}
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
      />
    </DashboardLayout>
  )
}
