import { api } from './api.js'

// Google Maps is used when the server has GOOGLE_MAPS_API_KEY; otherwise (or when the
// key is rejected) the maps fall back to OpenStreetMap.
let loading = null
let failed = false
const failureListeners = new Set()

// Resolves to { maps, mapId } once Google Maps is ready, or null to use OpenStreetMap.
export function loadGoogleMaps() {
  if (failed) return Promise.resolve(null)
  loading ||= (async () => {
    const cfg = await api.get('/maps/config').catch(() => null)
    if (!cfg?.googleKey) return null
    if (!window.google?.maps?.Map) {
      await new Promise((resolve, reject) => {
        const callback = '__smartCampusMapsReady'
        window[callback] = () => { delete window[callback]; resolve() }
        // Google calls this when the key is invalid, not enabled or not allowed on this address.
        window.gm_authFailure = () => {
          failed = true
          console.warn('[maps] Google Maps rejected the API key - using OpenStreetMap.')
          for (const fn of failureListeners) fn()
        }
        const script = document.createElement('script')
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cfg.googleKey)}&v=weekly&libraries=marker&loading=async&callback=${callback}`
        script.async = true
        script.onerror = () => reject(new Error('Google Maps could not be loaded.'))
        document.head.appendChild(script)
      })
    }
    return failed ? null : { maps: window.google.maps, mapId: cfg.mapId || 'DEMO_MAP_ID' }
  })().catch(() => null)
  return loading
}

// Called when Google rejects the key after the map has loaded. Returns an unsubscribe.
export function onGoogleMapsFailure(fn) {
  failureListeners.add(fn)
  return () => failureListeners.delete(fn)
}

// Address / place name → { lat, lng } (needs the Geocoding API on the key).
export async function geocode(maps, address) {
  const { results } = await new maps.Geocoder().geocode({ address, region: 'in' })
  const loc = results?.[0]?.geometry?.location
  if (!loc) throw new Error('Place not found.')
  return { lat: Math.round(loc.lat() * 1e6) / 1e6, lng: Math.round(loc.lng() * 1e6) / 1e6, label: results[0].formatted_address }
}
