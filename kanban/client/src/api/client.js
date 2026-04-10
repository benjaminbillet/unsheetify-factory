/**
 * API client for the Kanban board REST API.
 * All functions use relative URLs so Vite's dev proxy (/api → localhost:3001)
 * and same-origin production serving both work without configuration.
 */

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Card
 * @property {string} id
 * @property {string} title
 * @property {string|null} assignee
 * @property {string} column - e.g. 'ready', 'in-progress', 'done'
 * @property {number} position
 * @property {string|null} description
 * @property {number} created_at - Unix ms timestamp
 * @property {Comment[]} comments
 */

/**
 * @typedef {Object} Comment
 * @property {string} id
 * @property {string} card_id
 * @property {string} author
 * @property {string} content
 * @property {number} created_at
 */

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  /**
   * @param {string} msg
   * @param {number} status  HTTP status code, or 0 for network-level failures
   * @param {*} data         Parsed error response body, or null
   */
  constructor(msg, status, data) {
    super(msg)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function apiFetch(path, options = {}) {
  const headers = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(path, { ...options, headers: { ...headers, ...options.headers } })
  } catch (err) {
    throw new ApiError(`Network error: ${err.message}`, 0, null)
  }

  if (!response.ok) {
    let errorData = null
    try { errorData = await response.json() } catch { /* ignore */ }
    const message = errorData?.error ?? `HTTP error ${response.status}`
    throw new ApiError(message, response.status, errorData)
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return null
  }

  try {
    return await response.json()
  } catch (err) {
    throw new ApiError(`Failed to parse response: ${err.message}`, response.status, null)
  }
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/**
 * Fetch all cards with their nested comments.
 * @returns {Promise<Card[]>}
 * @throws {ApiError} on network or HTTP error
 * @example
 * const cards = await fetchCards()
 * console.log(cards[0].title)
 */
export async function fetchCards() {
  return apiFetch('/api/cards')
}

/**
 * Create a new card.
 * @param {{ title: string, assignee?: string, column?: string, description?: string }} data
 * @returns {Promise<Card>}
 * @throws {ApiError} on network or HTTP error
 * @example
 * const card = await createCard({ title: 'Fix bug', assignee: 'Alice' })
 * console.log(card.id)
 */
export async function createCard(data) {
  return apiFetch('/api/cards', { method: 'POST', body: JSON.stringify(data) })
}

/**
 * Partially update an existing card.
 * @param {string} id
 * @param {{ title?: string, assignee?: string, column?: string, description?: string, position?: number }} data
 * @returns {Promise<Card>}
 * @throws {ApiError} on network or HTTP error
 * @example
 * const updated = await updateCard('abc-123', { column: 'done' })
 */
export async function updateCard(id, data) {
  return apiFetch(`/api/cards/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

/**
 * Delete a card and all its comments.
 * @param {string} id
 * @returns {Promise<null>}
 * @throws {ApiError} on network or HTTP error
 * @example
 * await deleteCard('abc-123')
 */
export async function deleteCard(id) {
  return apiFetch(`/api/cards/${id}`, { method: 'DELETE' })
}

/**
 * Add a comment to a card.
 * @param {string} cardId
 * @param {{ author: string, content: string }} data
 * @returns {Promise<Comment>}
 * @throws {ApiError} on network or HTTP error
 * @example
 * const comment = await createComment('abc-123', { author: 'Bob', content: 'Looks good!' })
 */
export async function createComment(cardId, data) {
  return apiFetch(`/api/cards/${cardId}/comments`, { method: 'POST', body: JSON.stringify(data) })
}
