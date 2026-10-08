const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const REFRESH_TOKEN_KEY = 'club-admin.refresh-token'

let accessToken: string | null = null
let refreshInFlight: Promise<string | null> | null = null

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function announceApiError(message: string, status?: number) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('club-admin:api-error', { detail: { message, status } }))
}

type ApiOptions = RequestInit & {
  authenticated?: boolean
  retryAfterRefresh?: boolean
}

export function saveSessionTokens(nextAccessToken: string, refreshToken: string) {
  accessToken = nextAccessToken
  sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export function clearSessionTokens() {
  accessToken = null
  sessionStorage.removeItem(REFRESH_TOKEN_KEY)
}

function expireSession() {
  clearSessionTokens()
  window.dispatchEvent(new Event('club-admin:session-expired'))
}

export function hasStoredRefreshToken() {
  return Boolean(sessionStorage.getItem(REFRESH_TOKEN_KEY))
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight

  const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refreshToken) {
    clearSessionTokens()
    return null
  }

  refreshInFlight = fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) {
        expireSession()
        return null
      }
      const result = (await response.json()) as {
        accessToken: string
        refreshToken: string
      }
      saveSessionTokens(result.accessToken, result.refreshToken)
      return result.accessToken
    })
    .catch(() => {
      expireSession()
      return null
    })
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const {
    authenticated = true,
    retryAfterRefresh = true,
    headers,
    ...requestOptions
  } = options

  const requestHeaders = new Headers(headers)
  if (requestOptions.body && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }
  if (authenticated && accessToken) {
    requestHeaders.set('Authorization', `Bearer ${accessToken}`)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestOptions,
      headers: requestHeaders,
    })
  } catch (error) {
    announceApiError('Could not reach the server. Check your connection and try again.')
    throw error
  }

  if (
    response.status === 401 &&
    authenticated &&
    retryAfterRefresh &&
    !path.startsWith('/auth/')
  ) {
    const freshAccessToken = await refreshAccessToken()
    if (freshAccessToken) {
      return apiRequest<T>(path, { ...options, retryAfterRefresh: false })
    }
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as { message?: string | string[] }
      if (Array.isArray(body.message)) message = body.message.join('. ')
      else if (body.message) message = body.message
    } catch {
      // Keep the status-based message when the response has no JSON body.
    }
    announceApiError(message, response.status)
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
