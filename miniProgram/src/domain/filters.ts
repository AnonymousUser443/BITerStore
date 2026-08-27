import type { Listing, ListingFilters } from './types'

export const defaultFilters: ListingFilters = { query: '', category: '全部', campus: '全部', condition: '全部', minPrice: 0, maxPrice: 200, sort: '最新发布', availableOnly: true }
export function filterListings(listings: Listing[], filters: ListingFilters): Listing[] {
  const query = filters.query.trim().toLowerCase()
  const result = listings.filter((item) => {
    const matches = !query || [item.title, item.author, item.isbn, item.course, ...item.tags].join(' ').toLowerCase().includes(query)
    return matches && (filters.category === '全部' || item.category === filters.category)
      && (filters.campus === '全部' || item.campus === filters.campus)
      && (filters.condition === '全部' || item.condition === filters.condition)
      && item.price >= filters.minPrice && item.price <= filters.maxPrice
      && (!filters.availableOnly || item.status === 'available')
  })
  if (filters.sort === '价格从低到高') result.sort((a, b) => a.price - b.price)
  else if (filters.sort === '价格从高到低') result.sort((a, b) => b.price - a.price)
  else result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return result
}
