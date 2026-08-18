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

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
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
