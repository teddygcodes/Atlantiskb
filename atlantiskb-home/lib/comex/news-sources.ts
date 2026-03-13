import type { NewsMetal } from '@prisma/client'

export type NewsSource = {
  name: string
  url: string
  rssUrl: string
}

export const NEWS_SOURCES: NewsSource[] = [
  {
    name: 'Kitco',
    url: 'https://www.kitco.com/news',
    rssUrl: 'https://www.kitco.com/rss/news'
  },
  {
    name: 'Mining.com',
    url: 'https://www.mining.com',
    rssUrl: 'https://www.mining.com/feed/'
  },
  {
    // Provisional source entry pending URL/feed verification in final spec.
    name: 'Reuters Business',
    url: 'https://www.reuters.com/business/',
    rssUrl: 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best'
  }
]

export const RELEVANT_KEYWORDS = [
  'copper',
  'aluminum',
  'aluminium',
  'comex',
  'lme',
  'futures',
  'smelter',
  'refinery',
  'mine',
  'inventory',
  'supply',
  'demand',
  'tariff',
  'scrap',
  'warehouse',
  'concentrate'
]

export function isRelevant(text: string): boolean {
  const normalizedText = text.toLowerCase()
  return RELEVANT_KEYWORDS.some((keyword) => normalizedText.includes(keyword.toLowerCase()))
}

export function inferMetal(text: string): NewsMetal {
  const normalizedText = text.toLowerCase()

  const copperSignals = ['copper', 'cu', 'comex hg', 'lme copper']
  const aluminumSignals = ['aluminum', 'aluminium', 'ali', 'lme aluminum', 'lme aluminium']

  const hasCopperSignal = copperSignals.some((signal) => normalizedText.includes(signal))
  const hasAluminumSignal = aluminumSignals.some((signal) => normalizedText.includes(signal))

  if (hasCopperSignal && !hasAluminumSignal) return 'copper'
  if (hasAluminumSignal && !hasCopperSignal) return 'aluminum'

  return 'both'
}

// TODO(spec): Verify Reuters Business URL and fallback URL guidance exactly as the final spec indicates.
