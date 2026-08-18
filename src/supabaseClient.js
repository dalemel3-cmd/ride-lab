import { createClient } from '@supabase/supabase-js'

/**
 * Config comes from the environment only.
 *
 * No hardcoded fallback URL or key: a committed key is a key you can never
 * rotate without a code change, and a fallback silently points a broken build
 * at the wrong database instead of failing loudly.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.',
  )
}

// createClient throws on an empty URL, and it throws while this module is being
// imported — before React mounts, so neither the error boundary nor the
// "not configured" screen can render and the user gets a blank white page with
// no explanation. Falling back to a syntactically valid placeholder keeps the
// module loading so AuthGate can show a message that actually says what to fix.
// Nothing is ever requested from this host: isSupabaseConfigured gates the UI
// before any call is made.
const PLACEHOLDER_URL = 'https://not-configured.supabase.co'
const PLACEHOLDER_KEY = 'not-configured'

export const supabase = createClient(supabaseUrl || PLACEHOLDER_URL, supabaseAnonKey || PLACEHOLDER_KEY, {
  auth: {
    // The phone should stay signed in for the whole 4-month study — being asked
    // to log in at a trailhead with no signal is how a ride goes unlogged.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'ridelab_auth',
  },
})

/**
 * Marks that this device has signed in at least once.
 *
 * Without it there is no way to tell "never signed in" from "signed in before,
 * currently offline with an expired token" — and the second case must still let
 * the rider in to queue a ride rather than locking them out.
 */
const SIGNED_IN_BEFORE_KEY = 'ridelab_signed_in_before'

export const markSignedInBefore = () => {
  try {
    localStorage.setItem(SIGNED_IN_BEFORE_KEY, '1')
  } catch {
    /* private mode / storage disabled */
  }
}

export const hasSignedInBefore = () => {
  try {
    return localStorage.getItem(SIGNED_IN_BEFORE_KEY) === '1'
  } catch {
    return false
  }
}

export const clearSignedInBefore = () => {
  try {
    localStorage.removeItem(SIGNED_IN_BEFORE_KEY)
  } catch {
    /* private mode / storage disabled */
  }
}
