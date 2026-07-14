import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  fetchStarCount,
  parseStarHistoryData,
  renderStarHistorySvg,
  updateDailySnapshots
} from './generate-star-history.mjs'

test('fetchStarCount reads only repository metadata', async () => {
  const requests = []
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options })
    return new Response(JSON.stringify({ stargazers_count: 152 }), { status: 200 })
  }

  const count = await fetchStarCount({
    repository: 'zszz3/agent-session-search',
    token: 'test-token',
    fetchImpl
  })

  assert.equal(count, 152)
  assert.equal(requests[0].url, 'https://api.github.com/repos/zszz3/agent-session-search')
  assert.equal(requests[0].options.headers.accept, 'application/vnd.github+json')
  assert.equal(requests[0].options.headers.authorization, 'Bearer test-token')
})

test('fetchStarCount reports metadata failures and invalid counts', async () => {
  await assert.rejects(
    fetchStarCount({
      repository: 'zszz3/agent-session-search',
      token: 'test-token',
      fetchImpl: async () => new Response('{"message":"blocked"}', { status: 403 })
    }),
    /GitHub repository metadata request failed \(403\).*blocked/
  )
  await assert.rejects(
    fetchStarCount({
      repository: 'zszz3/agent-session-search',
      token: 'test-token',
      fetchImpl: async () => new Response('{"stargazers_count":-1}', { status: 200 })
    }),
    /invalid stargazers_count/
  )
})

test('parseStarHistoryData validates repository, ordering, dates, and counts', () => {
  const valid = {
    repository: 'zszz3/agent-session-search',
    snapshots: [{ date: '2026-07-13', count: 151 }, { date: '2026-07-14', count: 152 }]
  }
  assert.deepEqual(parseStarHistoryData(valid, valid.repository), valid)
  assert.throws(() => parseStarHistoryData({ ...valid, repository: 'other/repo' }, valid.repository), /repository mismatch/)
  assert.throws(() => parseStarHistoryData({ ...valid, snapshots: [{ date: '2026-02-30', count: 1 }] }, valid.repository), /invalid date/)
  assert.throws(() => parseStarHistoryData({ ...valid, snapshots: [{ date: '2026-07-14', count: 1 }, { date: '2026-07-14', count: 2 }] }, valid.repository), /strictly increasing/)
  assert.throws(() => parseStarHistoryData({ ...valid, snapshots: [{ date: '2026-07-14', count: -1 }] }, valid.repository), /non-negative integer/)
})

test('updateDailySnapshots replaces today and fills missing UTC days', () => {
  assert.deepEqual(
    updateDailySnapshots([{ date: '2026-07-13', count: 151 }], '2026-07-16', 150),
    [
      { date: '2026-07-13', count: 151 },
      { date: '2026-07-14', count: 151 },
      { date: '2026-07-15', count: 151 },
      { date: '2026-07-16', count: 150 }
    ]
  )
  assert.deepEqual(
    updateDailySnapshots([{ date: '2026-07-14', count: 151 }], '2026-07-14', 152),
    [{ date: '2026-07-14', count: 152 }]
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
  assert.match(workflow, /cron:\s*['"]7,22,37,52 \* \* \* \*['"]/)
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
