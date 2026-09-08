import { useCallback, useEffect, useState } from 'react'
import type { V2Customer, V2CustomerInput, V2CustomerUpdateInput } from '@shared/contracts/index'
import { getErrorMessage } from './v2-utils'

export function useCustomers() {
  const [customers, setCustomers] = useState<V2Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setCustomers(await window.yumiV2.customers.list({ includeDisabled: true }))
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const createCustomer = useCallback(async (input: V2CustomerInput) => {
    const customer = await window.yumiV2.customers.create(input)
    await reload()
    return customer
  }, [reload])

  const updateCustomer = useCallback(async (input: V2CustomerUpdateInput) => {
    const customer = await window.yumiV2.customers.update(input)
    await reload()
    return customer
  }, [reload])

  return { customers, loading, loadError, reload, createCustomer, updateCustomer }
}
