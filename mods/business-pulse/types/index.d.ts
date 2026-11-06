export type PulseLine = { label: string; value: string; tone?: 'success' | 'warning' | 'error' }

export type PulseCard = {
  id: string
  title: string
  lines: PulseLine[]
  error?: string
}

export type Pulse = {
  cards: PulseCard[]
  updatedAt: number | null
  isLoading: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'business-pulse': { pulse: Shaped<Pulse> }
  }
}
