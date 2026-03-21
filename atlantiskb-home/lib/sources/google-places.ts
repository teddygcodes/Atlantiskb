/**
 * Google Places API (New) — business profile lookup.
 * Uses Text Search to find electrical contractors by name + location.
 * Returns structured data: phone, website, rating, categories.
 * Requires GOOGLE_PLACES_API_KEY with "Places API (New)" enabled in Google Cloud Console.
 */

import { z } from 'zod'

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? ''

const GooglePlaceRawSchema = z.object({
  id: z.string().optional(),
  displayName: z.object({ text: z.string() }).optional(),
  nationalPhoneNumber: z.string().optional().nullable(),
  websiteUri: z.string().optional().nullable(),
  formattedAddress: z.string().optional().nullable(),
  rating: z.number().optional().nullable(),
  userRatingCount: z.number().optional().nullable(),
  types: z.array(z.string()).optional(),
  businessStatus: z.string().optional().nullable(),
  googleMapsUri: z.string().optional().nullable(),
})

const GooglePlacesResponseSchema = z.object({
  places: z.array(GooglePlaceRawSchema).optional(),
  nextPageToken: z.string().optional(),
})

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
  'places.types',
  'places.businessStatus',
  'places.googleMapsUri',
].join(',')

export interface PlaceResult {
  placeId: string
  name: string
  phone: string | null
  website: string | null
  formattedAddress: string | null
  rating: number | null
  userRatingCount: number | null
  types: string[]
  businessStatus: string | null
  googleMapsUri: string | null
}

export function isGooglePlacesConfigured(): boolean {
  return Boolean(GOOGLE_PLACES_API_KEY)
}

/**
 * Search Google Places for a company by name + location.
 * Returns the top result or null if not found.
 */
export async function findPlaceForCompany(
  name: string,
  city: string | null,
  state: string | null,
): Promise<PlaceResult | null> {
  if (!isGooglePlacesConfigured()) return null

  const location = [city, state].filter(Boolean).join(', ')
  const textQuery = location ? `${name} ${location}` : name

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({ textQuery, maxResultCount: 1 }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) return null
    const parsed = GooglePlacesResponseSchema.safeParse(await res.json())
    if (!parsed.success) {
      console.warn('[google-places] unexpected response shape:', parsed.error.issues)
      return null
    }
    const place = parsed.data.places?.[0]
    if (!place) return null

    return {
      placeId: place.id ?? '',
      name: place.displayName?.text ?? name,
      phone: place.nationalPhoneNumber ?? null,
      website: place.websiteUri ?? null,
      formattedAddress: place.formattedAddress ?? null,
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? null,
      types: place.types ?? [],
      businessStatus: place.businessStatus ?? null,
      googleMapsUri: place.googleMapsUri ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Search Google Places for a category query (e.g. "electricians Hall County GA").
 * Returns up to 20 results per page. Pass pageToken to fetch subsequent pages.
 */
export async function searchPlaces(
  query: string,
  pageToken?: string,
): Promise<{ results: PlaceResult[]; nextPageToken?: string }> {
  if (!isGooglePlacesConfigured()) return { results: [] }

  try {
    const body: Record<string, unknown> = { textQuery: query, maxResultCount: 20 }
    if (pageToken) body.pageToken = pageToken

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) return { results: [] }
    const parsed = GooglePlacesResponseSchema.safeParse(await res.json())
    if (!parsed.success) {
      console.warn('[google-places] unexpected response shape:', parsed.error.issues)
      return { results: [] }
    }

    const results: PlaceResult[] = (parsed.data.places ?? []).map((place) => ({
      placeId: place.id ?? '',
      name: place.displayName?.text ?? '',
      phone: place.nationalPhoneNumber ?? null,
      website: place.websiteUri ?? null,
      formattedAddress: place.formattedAddress ?? null,
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? null,
      types: place.types ?? [],
      businessStatus: place.businessStatus ?? null,
      googleMapsUri: place.googleMapsUri ?? null,
    }))

    return { results, nextPageToken: parsed.data.nextPageToken }
  } catch {
    return { results: [] }
  }
}

/**
 * Build a plain-text summary of a Places result for AI enrichment.
 */
export function buildPlaceText(place: PlaceResult, companyName: string): string {
  const lines: string[] = [`Company: ${companyName}`]

  if (place.businessStatus) {
    lines.push(`Business status: ${place.businessStatus}`)
  }
  if (place.types.length > 0) {
    const readable = place.types.map((t) => t.replace(/_/g, ' ')).join(', ')
    lines.push(`Business categories: ${readable}`)
  }
  if (place.formattedAddress) {
    lines.push(`Address: ${place.formattedAddress}`)
  }
  if (place.phone) {
    lines.push(`Phone: ${place.phone}`)
  }
  if (place.website) {
    lines.push(`Website: ${place.website}`)
  }
  if (place.rating !== null && place.userRatingCount !== null) {
    lines.push(`Google rating: ${place.rating}/5 (${place.userRatingCount} reviews)`)
  }
  if (place.googleMapsUri) {
    lines.push(`Google Maps: ${place.googleMapsUri}`)
  }

  return lines.join('\n')
}
