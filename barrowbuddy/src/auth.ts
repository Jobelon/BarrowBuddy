import { createClient } from '@supabase/supabase-js'
import type { AuthError } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = url && publishableKey ? createClient(url, publishableKey) : null
export const isCitEmail = (email: string) => /^[^@\s]+@cit\.edu$/i.test(email)
export const passwordMinLength = 8

export type ProfileDetails = {
  full_name: string
  student_id_number: string
  program: string
}

export const profileColumns = 'full_name, student_id_number, program'

export function readProfile(value: unknown): ProfileDetails | null {
  if (!value || typeof value !== 'object') return null

  const profile = value as Record<string, unknown>
  const fullName = typeof profile.full_name === 'string' ? profile.full_name.trim() : ''
  const studentId = typeof profile.student_id_number === 'string' ? profile.student_id_number.trim() : ''
  const program = typeof profile.program === 'string' ? profile.program.trim() : ''

  if (!fullName || fullName.length > 80 || !studentId || studentId.length > 64 || !program || program.length > 120) {
    return null
  }

  return { full_name: fullName, student_id_number: studentId, program }
}

export function authErrorMessage(error: AuthError, fallback: string) {
  switch (error.code) {
    case 'email_not_confirmed':
      return 'Confirm your CIT email using the link in your inbox, then log in again.'
    case 'invalid_credentials':
      return 'That email and password did not match. Check your details and try again.'
    case 'weak_password':
    case 'same_password':
      return error.message
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many requests. Wait a moment and try again.'
    default:
      return fallback
  }
}
