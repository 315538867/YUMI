import { useCallback, useEffect, useState } from 'react'
import type { V2Product, V2ProductInput, V2ProductUpdateInput } from '@shared/contracts/index'
import { getErrorMessage } from './v2-utils'

export function useProducts() {
  const [products, setProducts] = useState<V2Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setProducts(await window.yumiV2.products.list(true))
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const createProduct = useCallback(async (input: V2ProductInput) => {
    const product = await window.yumiV2.products.create(input)
    await reload()
    return product
  }, [reload])

  const updateProduct = useCallback(async (input: V2ProductUpdateInput) => {
    const product = await window.yumiV2.products.update(input)
    await reload()
    return product
  }, [reload])

  return { products, loading, loadError, reload, createProduct, updateProduct }
}
