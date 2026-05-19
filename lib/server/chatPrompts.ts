export type ChatMode = 'Interne' | 'IA' | 'Mixte'

export const systemPrompts: Record<ChatMode, string> = {
  Interne:
    'Tu es l’assistant métier NexaMind. Tu dois répondre uniquement avec les informations contenues dans les documents internes fournis. Ne fais pas d’hallucinations. Si la réponse ne se trouve pas clairement dans ces documents, indique que l’information n’est pas disponible et propose à l’utilisateur de reformuler ou d’ajouter des documents.',
  IA:
    'Tu es l’assistant métier NexaMind. Tu dois répondre uniquement avec les connaissances générales de l’IA et ne pas utiliser les documents internes. Ne mentionne pas de passages de documents internes.',
  Mixte:
    'Tu es l’assistant métier NexaMind. Tu peux utiliser les informations des documents internes fournis ainsi que tes connaissances générales. Priorise les informations documentaires quand elles sont pertinentes, puis enrichis la réponse avec tes connaissances générales si besoin.',
}

export function buildRagUserPrompt(query: string, topChunks: Array<{ chunk_text: string; chunk_index: number; document_id: string }>, mode: ChatMode) {
  if (mode === 'IA') {
    return query
  }

  const context = topChunks
    .map((chunk) => `Document ${chunk.document_id} - Passage ${chunk.chunk_index} :\n${chunk.chunk_text}`)
    .join('\n\n')

  const guidance =
    mode === 'Interne'
      ? 'Réponds uniquement à partir du contenu ci-dessus. Si la réponse n’est pas présente, indique clairement que tu n’as pas assez d’information.'
      : 'Utilise d’abord le contenu ci-dessus pour répondre, puis enrichis avec des connaissances générales si besoin.'

  return `${context}\n\n${guidance}\n\nQuestion : ${query}`
}

export function buildMistralMessages(source: ChatMode, messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const result: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompts[source] },
    ...messages.map((message) => ({ role: message.role, content: message.content })),
  ]
  return result
}

export function buildUnifiedChatSystemPrompt(documentContext: string) {
  const basePrompt =
    'Tu es l’assistant métier NexaMind. Tu dois répondre aux questions en utilisant les documents internes fournis. Ne fais pas d’hallucinations, cite les informations pertinentes et reconnais quand la réponse n’est pas disponible dans les documents.'

  if (!documentContext.trim()) {
    return `${basePrompt}\n\nAucun document interne n’est disponible actuellement. Informe l’utilisateur que tu ne peux pas répondre avec des documents internes et propose de téléverser des documents supplémentaires.`
  }

  // When documents are present, provide clear instructions for summarization, QA and citations.
  const guidance =
    '\n\nInstructions:\n- Utilise uniquement les passages des DOCUMENTS INTERNES fournis ci-dessous pour répondre aux questions factuelles.\n- Pour chaque information citée, indique la source sous la forme "(Document N - <id> : <title>)" ou indique le titre si l’ID est absent.\n- Si l’utilisateur demande un résumé, fournis un sommaire clair et indique les passages sources.\n- Si la réponse n’est pas trouvée, admet que l’information n’est pas disponible dans les documents et propose des actions (téléverser d’autres fichiers, extraire le texte, poser une question de clarification).\n- Préserve la confidentialité et ne divulgue pas de données sensibles non demandées.'

  return `${basePrompt}\n\nDOCUMENTS INTERNES:\n${documentContext}${guidance}`
}
