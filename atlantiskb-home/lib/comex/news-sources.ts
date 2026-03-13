import type { NewsMetal } from '@prisma/client'

export type NewsSource = {
  name: string
  url: string
  rssUrl: string
}

export const NEWS_SOURCES: NewsSource[] = [
  {
    name: 'Google News - COMEX Copper Futures',
    url: 'https://news.google.com/search?q=COMEX+copper+futures',
    rssUrl:
      'https://news.google.com/rss/search?q=COMEX+copper+futures&hl=en-US&gl=US&ceid=US:en'
  },
  {
    name: 'Google News - Aluminum Market',
    url: 'https://news.google.com/search?q=aluminum+market+supply+demand',
    rssUrl:
      'https://news.google.com/rss/search?q=aluminum+market+supply+demand&hl=en-US&gl=US&ceid=US:en'
  },
  {
    name: 'Google News - Copper Mining & Smelter',
    url: 'https://news.google.com/search?q=copper+mine+smelter+refinery',
    rssUrl:
      'https://news.google.com/rss/search?q=copper+mine+smelter+refinery&hl=en-US&gl=US&ceid=US:en'
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
