import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchCards, createCard, updateCard, deleteCard, createComment, ApiError } from './client.js'

// ---------------------------------------------------------------------------
// Shared mock-response factory
// Always include headers.get so the final apiFetch (which calls
// response.headers.get('content-length')) never throws TypeError.
// ---------------------------------------------------------------------------
function mockResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  }
}

// ===========================================================================
// SUBTASK 1 — Basic fetch wrapper functions
// ===========================================================================

describe('fetchCards', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(mockResponse([]))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('calls fetch with URL /api/cards', async () => {
    await fetchCards()
    expect(fetchMock).toHaveBeenCalledWith('/api/cards', expect.anything())
  })

  it('does not set Content-Type header', async () => {
    await fetchCards()
    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers).not.toHaveProperty('Content-Type')
  })
})

describe('createCard', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(mockResponse({ id: '1', title: 'Test' }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('calls fetch with method POST and URL /api/cards', async () => {
    await createCard({ title: 'Test' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cards',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('sends JSON-serialised body', async () => {
    const data = { title: 'Test', assignee: 'Alice' }
    await createCard(data)
    const [, options] = fetchMock.mock.calls[0]
    expect(options.body).toBe(JSON.stringify(data))
  })

  it('sets Content-Type: application/json', async () => {
    await createCard({ title: 'Test' })
    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers).toHaveProperty('Content-Type', 'application/json')
  })
})

describe('updateCard', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(mockResponse({ id: 'abc', title: 'Updated' }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('calls fetch with method PATCH and correct URL', async () => {
    await updateCard('abc-123', { title: 'Updated' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cards/abc-123',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('sends JSON-serialised body', async () => {
    const data = { title: 'Updated', column: 'done' }
    await updateCard('abc-123', data)
    const [, options] = fetchMock.mock.calls[0]
    expect(options.body).toBe(JSON.stringify(data))
  })

  it('sets Content-Type: application/json', async () => {
    await updateCard('abc-123', { title: 'Updated' })
    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers).toHaveProperty('Content-Type', 'application/json')
  })
})

describe('deleteCard', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(mockResponse(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('calls fetch with method DELETE and correct URL', async () => {
    await deleteCard('abc-123')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cards/abc-123',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('does not set Content-Type header', async () => {
    await deleteCard('abc-123')
    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers).not.toHaveProperty('Content-Type')
  })
})

describe('createComment', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ id: 'c1', card_id: 'abc-123', author: 'Bob', content: 'Hello' }, { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('calls fetch with method POST and correct URL', async () => {
    await createComment('abc-123', { author: 'Bob', content: 'Hello' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cards/abc-123/comments',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('sends JSON-serialised body', async () => {
    const data = { author: 'Bob', content: 'Hello' }
    await createComment('abc-123', data)
    const [, options] = fetchMock.mock.calls[0]
    expect(options.body).toBe(JSON.stringify(data))
  })

  it('sets Content-Type: application/json', async () => {
    await createComment('abc-123', { author: 'Bob', content: 'Hello' })
    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers).toHaveProperty('Content-Type', 'application/json')
  })
})

// ===========================================================================
// SUBTASK 2 — Error handling
// ===========================================================================

describe('network errors', () => {
  let fetchMock

  afterEach(() => vi.unstubAllGlobals())

  it('re-throws network failure as ApiError with status 0', async () => {
    fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCards()).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
    })
  })

  it('ApiError.message contains the original network error message', async () => {
    fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCards()).rejects.toThrow('Failed to fetch')
  })
})

describe('HTTP error responses', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('404 response throws ApiError with status 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ error: 'Not Found' }, { status: 404 })),
    )
    await expect(fetchCards()).rejects.toMatchObject({ name: 'ApiError', status: 404 })
  })

  it('500 response throws ApiError with status 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ error: 'Internal Server Error' }, { status: 500 })),
    )
    await expect(fetchCards()).rejects.toMatchObject({ name: 'ApiError', status: 500 })
  })

  it('uses error body { error } string as ApiError.message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ error: 'Not Found' }, { status: 404 })),
    )
    await expect(fetchCards()).rejects.toThrow('Not Found')
  })

  it('falls back to "HTTP error <status>" when error body is non-JSON', async () => {
    const nonJsonError = mockResponse(null, { status: 404 })
    nonJsonError.json = () => Promise.reject(new SyntaxError('Unexpected token'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(nonJsonError))

    await expect(fetchCards()).rejects.toThrow('HTTP error 404')
  })

  it('ApiError.data contains the parsed error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ error: 'Not Found' }, { status: 404 })),
    )
    let caught
    try {
      await fetchCards()
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect(caught.data).toEqual({ error: 'Not Found' })
  })
})

// ===========================================================================
// SUBTASK 3 — JSON parsing & response handling
// ===========================================================================

describe('successful response parsing', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetchCards() returns the parsed array', async () => {
    const cards = [{ id: '1', title: 'Card A' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(cards)))
    const result = await fetchCards()
    expect(result).toEqual(cards)
  })

  it('createCard() returns the parsed card object', async () => {
    const card = { id: '2', title: 'New Card' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(card, { status: 201 })))
    const result = await createCard({ title: 'New Card' })
    expect(result).toEqual(card)
  })

  it('updateCard() returns the parsed updated card', async () => {
    const card = { id: 'abc', title: 'Updated', column: 'done' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(card)))
    const result = await updateCard('abc', { column: 'done' })
    expect(result).toEqual(card)
  })

  it('createComment() returns the parsed comment object', async () => {
    const comment = { id: 'c1', card_id: 'abc', author: 'Bob', content: 'Hi' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(comment, { status: 201 })))
    const result = await createComment('abc', { author: 'Bob', content: 'Hi' })
    expect(result).toEqual(comment)
  })
})

describe('empty responses', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('204 status returns null without calling json()', async () => {
    const jsonSpy = vi.fn()
    const empty204 = mockResponse(null, { status: 204 })
    empty204.json = jsonSpy
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(empty204))

    const result = await deleteCard('abc-123')
    expect(result).toBeNull()
    expect(jsonSpy).not.toHaveBeenCalled()
  })

  it('content-length: 0 returns null without calling json()', async () => {
    const jsonSpy = vi.fn()
    const emptyBody = mockResponse(null, { status: 200, headers: { 'content-length': '0' } })
    emptyBody.json = jsonSpy
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyBody))

    const result = await fetchCards()
    expect(result).toBeNull()
    expect(jsonSpy).not.toHaveBeenCalled()
  })
})

describe('malformed JSON', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('throws ApiError when response.json() rejects', async () => {
    const badJson = mockResponse(null, { status: 200 })
    badJson.json = () => Promise.reject(new SyntaxError('Unexpected token'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(badJson))

    await expect(fetchCards()).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
    })
  })
})
