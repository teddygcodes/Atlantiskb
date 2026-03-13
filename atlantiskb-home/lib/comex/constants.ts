export const METAL_CONFIG = {
  copper:   { symbol: 'HG=F', name: 'Copper',   unit: 'USD/lb' },
  aluminum: { symbol: 'ALI=F', name: 'Aluminum', unit: 'USD/ton' },
} as const

export type MetalKey = keyof typeof METAL_CONFIG
export const METAL_KEYS = Object.keys(METAL_CONFIG) as MetalKey[]
