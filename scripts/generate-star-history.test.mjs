import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  buildDailySeries,
  fetchStargazers,
  renderStarHistorySvg
} from './generate-star-history.mjs'

test('buildDailySeries sorts stars and fills missing UTC days cumulatively', () => {
  const series = buildDailySeries([
    '2026-06-03T08:00:00Z',
    '2026-06-01T12:00:00Z',
    '2026-06-03T09:00:00Z'
  ])

  assert.deepEqual(series, [
    { date: '2026-06-01', count: 1 },
    { date: '2026-06-02', count: 1 },
    { date: '2026-06-03', count: 3 }
  ])
})

test('fetchStargazers authenticates timestamp requests and follows pagination', async () => {
  const requests = []
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    starred_at: `2026-06-01T00:${String(index % 60).padStart(2, '0')}:00Z`,
    user: { login: `user-${index}` }
  }))
  const pages = [firstPage, [{ starred_at: '2026-06-02T00:00:00Z', user: { login: 'last' } }]]
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options })
    return new Response(JSON.stringify(pages.shift()), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  const timestamps = await fetchStargazers({
    repository: 'zszz3/agent-session-search',
    token: 'test-token',
    fetchImpl
  })

  assert.equal(timestamps.length, 101)
  assert.equal(requests.length, 2)
  assert.match(requests[0].url, /per_page=100&page=1$/)
  assert.match(requests[1].url, /per_page=100&page=2$/)
  assert.equal(requests[0].options.headers.accept, 'application/vnd.github.star+json')
  assert.equal(requests[0].options.headers.authorization, 'Bearer test-token')
})

test('fetchStargazers reports repository and page for malformed JSON', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => { throw new SyntaxError('Unexpected token') }
  })

  await assert.rejects(
    fetchStargazers({
      repository: 'zszz3/agent-session-search',
      token: 'test-token',
      fetchImpl
    }),
    /Invalid GitHub Stargazers response for zszz3\/agent-session-search page 1/
  )
})

test('renderStarHistorySvg is deterministic and describes the final star count', () => {
  const input = {
    repository: 'zszz3/agent-session-search',
    series: [
      { date: '2026-06-01', count: 1 },
      { date: '2026-06-02', count: 1 },
      { date: '2026-06-03', count: 3 }
    ]
  }

  const first = renderStarHistorySvg(input)
  const second = renderStarHistorySvg(input)

  assert.equal(first, second)
  assert.match(first, /Agent-Session-Search Star History/)
  assert.match(first, /reaching 3 stars/)
  assert.match(first, /Updated Jun 3, 2026/)
  assert.doesNotMatch(first, /NaN|undefined/)
})

test('scheduled workflow regenerates and commits the chart only when it changes', async () => {
  const workflow = await readFile('.github/workflows/update-star-history.yml', 'utf8')

  assert.match(workflow, /schedule:/)
  assert.match(workflow, /cron:/)
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /contents:\s*write/)
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40} # v4/)
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40} # v4/)
  assert.match(workflow, /node-version:\s*22/)
  assert.match(workflow, /GITHUB_TOKEN:/)
  assert.match(workflow, /node scripts\/generate-star-history\.mjs/)
  assert.match(workflow, /git diff --quiet -- assets\/star-history\.svg/)
  assert.match(workflow, /git push/)
})
