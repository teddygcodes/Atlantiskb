/**
 * Shared COMEX types used by scenario endpoint and chart components.
 */

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
