/**
 * Shared COMEX types used by technicals/scenario endpoints and chart components.
 */

import type {
  IndicatorPoint,
  MACDPoint,
  BollingerPoint,
  StochasticPoint,
  TechnicalSummary,
} from '@/lib/comex/technical-indicators'

export interface TechnicalsResponse {
  metal: string
  currentPrice: number
  computedAt: string
  summary: TechnicalSummary
  indicators: {
    sma: { sma10: IndicatorPoint[]; sma30: IndicatorPoint[]; sma50: IndicatorPoint[] }
    rsi: IndicatorPoint[]
    macd: MACDPoint[]
    bollinger: BollingerPoint[]
    stochastic: StochasticPoint[]
    atr: IndicatorPoint[]
  }
  supportResistance: { support: number[]; resistance: number[] }
  priceHistory: Array<{ date: string; open: number | null; high: number | null; low: number | null; close: number }>
}

export interface Range {
  low: number
  high: number
}

export interface ScenarioHorizon {
  '1week': Range
  '30day': Range
  '90day': Range
  catalyst: string
}

export interface ScenarioData {
  metal: string
  currentPrice: number
  asOfDate: string
  scenarios: {
    bull: ScenarioHorizon
    base: ScenarioHorizon
    bear: ScenarioHorizon
  }
  keyLevels: {
    strongSupport: number
    support: number
    resistance: number
    strongResistance: number
  }
  technicalBias: string
  newsSentiment: 'bullish' | 'bearish' | 'mixed' | 'neutral'
  summary: string
}
