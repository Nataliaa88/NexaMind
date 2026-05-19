import { SupabaseClient } from '@supabase/supabase-js'

export interface DocumentSummary {
  id: string
  title: string
  content: string
}

/**
 * Récupère tous les documents d'un utilisateur et construit un contexte texte simple
 * Architecture MVP : pas d'embeddings, pas de pgvector
 * @param supabaseAdmin - Client Supabase admin
 * @param userId - ID de l'utilisateur
 * @returns Contexte formaté avec les documents, ou string vide si aucun document
 */
export async function getDocumentContextForUser(
  supabaseAdmin: SupabaseClient<any>,
  userId: string
): Promise<string> {
  try {
    const { data: documents, error } = await supabaseAdmin
      .from('documents')
      .select('id, title, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[documentContext] fetch error', { error })
      throw new Error(`Impossible de charger les documents : ${error.message}`)
    }

    if (!documents || documents.length === 0) {
      return ''
    }

    // Filtrer et limiter le contenu pour éviter les tokens overflow
    const validDocs = (documents as DocumentSummary[])
      .filter((doc) => doc.content && doc.content.trim())
      .slice(0, 10) // Limiter à 10 documents pour éviter trop de contexte

    if (validDocs.length === 0) {
      return ''
    }

    // Construire un contexte formaté
    const context = validDocs
      .map((doc, index) => {
        // Allow larger per-document limit but still guard against huge payloads
        const sanitizedContent = doc.content
          .substring(0, 15000) // Limiter chaque document à 15k caractères
          .trim()

        // Include stable identifier and title to help the model cite sources
        const title = doc.title ? doc.title.trim() : `Sans titre (${doc.id})`
        return `=== Document ${index + 1} (${doc.id}): ${title} ===\n${sanitizedContent}`
      })
      .join('\n\n')

    return context
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error('[documentContext] unexpected error', { msg, err })
    throw new Error(`Erreur lors de la récupération des documents : ${msg}`)
  }
}

/**
 * Construit le prompt utilisateur pour le mode Interne ou Mixte
 * @param query - La question de l'utilisateur
 * @param documentContext - Le contexte des documents
 * @param mode - 'Interne' ou 'Mixte'
 * @returns Le prompt formaté
 */
export function buildContextPrompt(query: string, documentContext: string, mode: 'Interne' | 'Mixte'): string {
  if (!documentContext.trim()) {
    if (mode === 'Interne') {
      return `Question : ${query}\n\nNote: Aucun document disponible pour cette recherche.`
    }
    // Mode Mixte avec pas de documents : juste la question
    return query
  }

  const instruction =
    mode === 'Interne'
      ? 'Réponds uniquement à partir des documents fournis ci-dessous. Si la réponse n\'est pas présente dans les documents, indique clairement que tu n\'as pas assez d\'information.'
      : 'Utilise d\'abord les documents fournis ci-dessous pour répondre. Si tu as besoin de plus d\'informations, enrichis avec tes connaissances générales.'

  return `${instruction}\n\nDOCUMENTS FOURNIS:\n\n${documentContext}\n\nQUESTION DE L'UTILISATEUR:\n${query}`
}
