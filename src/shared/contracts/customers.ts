import type { IsoDateTime } from './common'

export interface V2Customer {
  id: string
  name: string
  contact: string | null
  defaultAddress: string | null
  notes: string | null
  enabled: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2CustomerInput {
  name: string
  contact?: string | null
  defaultAddress?: string | null
  notes?: string | null
}

export interface V2CustomerUpdateInput extends V2CustomerInput {
  id: string
  enabled?: boolean
}

export interface V2CustomerQuery {
  keyword?: string
  includeDisabled?: boolean
}
