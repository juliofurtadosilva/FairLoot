// Shared wishlist cache — stale-while-revalidate pattern
// Used by Loot, Wishlist, and Dashboard pages to share data and avoid redundant fetches

const CACHE_KEY = 'fairloot_wishlist_cache'

// In-memory singleton — fastest access, no JSON parse overhead
let _memData: any[] | null = null

/**
 * Get any cached wishlist data available (memory or sessionStorage).
 * Returns even "old" data for instant render — caller should always revalidate.
 */
export function getCachedWishlist(): any[] | null {
  if (_memData && _memData.length > 0) return _memData
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.data) && parsed.data.length > 0) {
      _memData = parsed.data
      return parsed.data
    }
  } catch {}
  return null
}

/**
 * Store fresh wishlist data in memory + sessionStorage.
 */
export function setCachedWishlist(data: any[]): void {
  _memData = data
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data }))
  } catch {}
}

/** Background refresh interval — 3 minutes */
export const WISHLIST_REFRESH_INTERVAL = 3 * 60 * 1000
