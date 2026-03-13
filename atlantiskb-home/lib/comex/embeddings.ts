const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_MODEL = 'voyage-3-lite'
const VOYAGE_MAX_BATCH_SIZE = 128

interface VoyageEmbeddingsResponse {
  data?: Array<{
    embedding?: number[]
  }>
}

function getVoyageApiKey(): string {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY is not set. Please set VOYAGE_API_KEY before requesting embeddings.')
  }
  return apiKey
}

async function requestEmbeddings(input: string[]): Promise<number[][]> {
  const apiKey = getVoyageApiKey()

  const res = await fetch(VOYAGE_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input,
    }),
  })

  if (!res.ok) {
    let details = ''
    try {
      details = await res.text()
    } catch {
      details = ''
    }

    throw new Error(
      `Voyage embeddings request failed with status ${res.status} ${res.statusText}${details ? `: ${details}` : ''}`,
    )
  }

  const payload = (await res.json()) as VoyageEmbeddingsResponse
  const embeddings = payload.data?.map((item) => item.embedding)

  if (!embeddings || embeddings.some((embedding) => !Array.isArray(embedding))) {
    throw new Error('Voyage embeddings response is missing expected data[].embedding arrays.')
  }

  return embeddings as number[][]
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await requestEmbeddings([text])
  return embedding
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  if (texts.length <= VOYAGE_MAX_BATCH_SIZE) {
    return requestEmbeddings(texts)
  }

  const embeddings: number[][] = []
  for (let i = 0; i < texts.length; i += VOYAGE_MAX_BATCH_SIZE) {
    const chunk = texts.slice(i, i + VOYAGE_MAX_BATCH_SIZE)
    const chunkEmbeddings = await requestEmbeddings(chunk)
    embeddings.push(...chunkEmbeddings)
  }

  return embeddings
}
