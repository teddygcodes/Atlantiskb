import type { NewsMetal } from '@prisma/client'

export type NewsSource = {
  name: string
  url: string
  rssUrl: string
  quality: 'high' | 'standard'
}

export const NEWS_SOURCES: NewsSource[] = [
  {
    name: 'Google News - COMEX Copper Futures',
    url: 'https://news.google.com/search?q=COMEX+copper+futures',
    rssUrl:
      'https://news.google.com/rss/search?q=COMEX+copper+futures&hl=en-US&gl=US&ceid=US:en',
    quality: 'standard',
  },
  {
    name: 'Google News - Aluminum Market',
    url: 'https://news.google.com/search?q=aluminum+market+supply+demand',
    rssUrl:
      'https://news.google.com/rss/search?q=aluminum+market+supply+demand&hl=en-US&gl=US&ceid=US:en',
    quality: 'standard',
  },
  {
    name: 'Google News - Copper Mining & Smelter',
    url: 'https://news.google.com/search?q=copper+mine+smelter+refinery',
    rssUrl:
      'https://news.google.com/rss/search?q=copper+mine+smelter+refinery&hl=en-US&gl=US&ceid=US:en',
    quality: 'standard',
  },
  {
    name: 'Google News - Metals Trade & Tariffs',
    url: 'https://news.google.com/search?q=copper+aluminum+tariff+trade+China+metals',
    rssUrl:
      'https://news.google.com/rss/search?q=copper+aluminum+tariff+trade+China+metals&hl=en-US&gl=US&ceid=US:en',
    quality: 'standard',
  },
]

const METAL_TERMS = ['copper', 'aluminum', 'aluminium']

export const DRIVER_TERMS = [
  'price', 'futures', 'market', 'supply', 'demand', 'inventory',
  'tariff', 'smelter', 'mine', 'refinery', 'strike', 'disruption',
  'imports', 'exports', 'output', 'production', 'shortage', 'surplus',
  'rally', 'decline', 'warehouse', 'concentrate', 'scrap', 'china',
  'lme', 'comex',
]

export function isRelevant(text: string): boolean {
  const lower = text.toLowerCase()
  const hasMetal = METAL_TERMS.some(t => lower.includes(t))
  if (!hasMetal) return false
  return DRIVER_TERMS.some(t => lower.includes(t))
}

export function inferMetal(text: string): NewsMetal {
  const lower = text.toLowerCase()

  const hasCopperSignal =
    ['copper', 'comex hg', 'lme copper'].some(s => lower.includes(s)) ||
    /\bcu\b/.test(lower)
  const hasAluminumSignal =
    ['aluminum', 'aluminium', 'lme aluminum', 'lme aluminium'].some(s => lower.includes(s))

  if (hasCopperSignal && !hasAluminumSignal) return 'copper'
  if (hasAluminumSignal && !hasCopperSignal) return 'aluminum'

  return 'both'
}
