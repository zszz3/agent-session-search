# Star History Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the restricted Stargazers-list request with a repository-owned daily Star-count snapshot so the scheduled chart update works without a PAT.

**Architecture:** `scripts/generate-star-history.mjs` will fetch only repository metadata, validate and update `assets/star-history-data.json`, then render the existing SVG from those snapshots. The workflow will commit the JSON and SVG together; a one-time collaborator-authorized read supplies the anonymous historical baseline.

**Tech Stack:** Node.js 22 ESM, built-in `fetch`, `node:test`, GitHub Actions, JSON, deterministic SVG rendering.

## Global Constraints

- Do not add a PAT, repository secret, GitHub App, runtime dependency, or third-party chart service.
- Do not persist Stargazer usernames, IDs, raw API responses, or credentials.
- Keep the existing schedule and README chart placement unchanged.
- Allow Star counts to decrease when users remove Stars; do not describe the future series as cumulative.
- Add exactly one user-facing release note at `.release-notes/star-history-snapshots.md`.
- Do not modify PR #76's Release workflow fix.

---

### Task 1: Snapshot domain and repository metadata client

**Files:**
- Modify: `scripts/generate-star-history.test.mjs`
- Modify: `scripts/generate-star-history.mjs`

**Interfaces:**
- Produces: `fetchStarCount({ repository, token, fetchImpl = fetch }): Promise<number>`
- Produces: `parseStarHistoryData(value, repository): { repository: string, snapshots: Array<{ date: string, count: number }> }`
- Produces: `updateDailySnapshots(snapshots, date, count): Array<{ date: string, count: number }>`
- Consumes: `repository` in exact `owner/repo` format, UTC date keys, and non-negative integer counts.

- [ ] **Step 1: Replace Stargazers-list tests with failing metadata and snapshot tests**

Update the imports in `scripts/generate-star-history.test.mjs`:

```js
import {
  fetchStarCount,
  parseStarHistoryData,
  renderStarHistorySvg,
  updateDailySnapshots
} from './generate-star-history.mjs'
```

Add focused tests with these assertions:

```js
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
```

- [ ] **Step 2: Run the script test and verify RED**

Run:

```bash
node --test scripts/generate-star-history.test.mjs
```

Expected: FAIL because `fetchStarCount`, `parseStarHistoryData`, and `updateDailySnapshots` are not exported.

- [ ] **Step 3: Implement the minimal domain and client functions**

In `scripts/generate-star-history.mjs`:

```js
function repositoryParts(repository) {
  const [owner, repo, ...extra] = repository.split('/')
  if (!owner || !repo || extra.length > 0) {
    throw new Error(`GITHUB_REPOSITORY must use owner/repo format, received: ${repository}`)
  }
  return { owner, repo }
}

export async function fetchStarCount({ repository, token, fetchImpl = fetch }) {
  const { owner, repo } = repositoryParts(repository)
  if (!token) throw new Error('GITHUB_TOKEN is required to read repository metadata')
  const response = await fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    { headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'agent-session-search-star-history'
    } }
  )
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub repository metadata request failed (${response.status}): ${body.slice(0, 300)}`)
  }
  let metadata
  try { metadata = await response.json() } catch (error) {
    throw new Error(`Invalid GitHub repository metadata response for ${repository}: response is not valid JSON`, { cause: error })
  }
  if (!Number.isInteger(metadata?.stargazers_count) || metadata.stargazers_count < 0) {
    throw new Error(`Invalid GitHub repository metadata response for ${repository}: invalid stargazers_count`)
  }
  return metadata.stargazers_count
}
```

Implement strict UTC date round-trip validation, repository equality, strictly increasing dates, and non-negative integer counts:

```js
function isUtcDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

export function parseStarHistoryData(value, repository) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Star History data: expected an object')
  }
  if (value.repository !== repository) {
    throw new Error(`Invalid Star History data: repository mismatch, expected ${repository}`)
  }
  if (!Array.isArray(value.snapshots)) {
    throw new Error('Invalid Star History data: snapshots must be an array')
  }
  let previousDate = null
  const snapshots = value.snapshots.map((snapshot, index) => {
    if (!snapshot || typeof snapshot !== 'object' || !isUtcDateKey(snapshot.date)) {
      throw new Error(`Invalid Star History data: snapshot ${index} has an invalid date`)
    }
    if (previousDate !== null && snapshot.date <= previousDate) {
      throw new Error('Invalid Star History data: snapshot dates must be strictly increasing')
    }
    if (!Number.isInteger(snapshot.count) || snapshot.count < 0) {
      throw new Error(`Invalid Star History data: snapshot ${index} count must be a non-negative integer`)
    }
    previousDate = snapshot.date
    return { date: snapshot.date, count: snapshot.count }
  })
  return { repository, snapshots }
}

export function updateDailySnapshots(snapshots, date, count) {
  if (!isUtcDateKey(date)) throw new Error(`Invalid snapshot date: ${date}`)
  if (!Number.isInteger(count) || count < 0) throw new Error(`Invalid snapshot count: ${count}`)
  if (snapshots.length === 0) return [{ date, count }]

  const next = snapshots.map((snapshot) => ({ ...snapshot }))
  const last = next.at(-1)
  if (date < last.date) throw new Error(`Snapshot date ${date} is earlier than existing history ending ${last.date}`)
  if (date === last.date) {
    next[next.length - 1] = { date, count }
    return next
  }

  for (let timestamp = Date.parse(`${last.date}T00:00:00Z`) + DAY_MS; ; timestamp += DAY_MS) {
    const missingDate = new Date(timestamp).toISOString().slice(0, 10)
    if (missingDate >= date) break
    next.push({ date: missingDate, count: last.count })
  }
  next.push({ date, count })
  return next
}
```

Remove `fetchStargazers` and its use from production code.

- [ ] **Step 4: Run the script test and verify GREEN**

Run:

```bash
node --test scripts/generate-star-history.test.mjs
```

Expected: all snapshot-domain and rendering tests pass.

- [ ] **Step 5: Commit the domain change**

```bash
git add scripts/generate-star-history.mjs scripts/generate-star-history.test.mjs
git commit -m "fix: track star history from repository metadata"
```

---

### Task 2: Idempotent JSON and SVG artifact generation

**Files:**
- Modify: `scripts/generate-star-history.test.mjs`
- Modify: `scripts/generate-star-history.mjs`

**Interfaces:**
- Consumes: Task 1's `fetchStarCount`, `parseStarHistoryData`, and `updateDailySnapshots`.
- Produces: `generateStarHistory({ repository, token, dataPath, outputPath, now, fetchImpl }): Promise<boolean>`.
- Produces: `main()` mapping environment defaults to `generateStarHistory`.

- [ ] **Step 1: Write failing artifact-generation tests**

Add `mkdtemp`, `tmpdir`, `join`, `readFile`, and `writeFile` imports, then add:

```js
test('generateStarHistory updates the snapshot and SVG together', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'star-history-'))
  const dataPath = join(directory, 'star-history-data.json')
  const outputPath = join(directory, 'star-history.svg')
  await writeFile(dataPath, JSON.stringify({
    repository: 'zszz3/agent-session-search',
    snapshots: [{ date: '2026-07-13', count: 151 }]
  }))

  const changed = await generateStarHistory({
    repository: 'zszz3/agent-session-search',
    token: 'test-token',
    dataPath,
    outputPath,
    now: new Date('2026-07-14T08:00:00Z'),
    fetchImpl: async () => new Response(JSON.stringify({ stargazers_count: 152 }), { status: 200 })
  })

  assert.equal(changed, true)
  assert.deepEqual(JSON.parse(await readFile(dataPath, 'utf8')).snapshots.at(-1), { date: '2026-07-14', count: 152 })
  assert.match(await readFile(outputPath, 'utf8'), /reaching 152 stars/)
})

test('generateStarHistory is idempotent when today is unchanged', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'star-history-idempotent-'))
  const dataPath = join(directory, 'star-history-data.json')
  const outputPath = join(directory, 'star-history.svg')
  const data = {
    repository: 'zszz3/agent-session-search',
    snapshots: [{ date: '2026-07-14', count: 152 }]
  }
  const json = `${JSON.stringify(data, null, 2)}\n`
  const svg = renderStarHistorySvg({ repository: data.repository, series: data.snapshots })
  await writeFile(dataPath, json)
  await writeFile(outputPath, svg)

  const changed = await generateStarHistory({
    repository: data.repository,
    token: 'test-token',
    dataPath,
    outputPath,
    now: new Date('2026-07-14T23:59:59Z'),
    fetchImpl: async () => new Response(JSON.stringify({ stargazers_count: 152 }), { status: 200 })
  })

  assert.equal(changed, false)
  assert.equal(await readFile(dataPath, 'utf8'), json)
  assert.equal(await readFile(outputPath, 'utf8'), svg)
})

test('rendered description uses star count history rather than cumulative wording', () => {
  const svg = renderStarHistorySvg({
    repository: 'zszz3/agent-session-search',
    series: [{ date: '2026-07-13', count: 152 }, { date: '2026-07-14', count: 151 }]
  })
  assert.match(svg, /GitHub star count history/)
  assert.doesNotMatch(svg, /Cumulative GitHub stars/)
})
```

- [ ] **Step 2: Run the script test and verify RED**

Run:

```bash
node --test scripts/generate-star-history.test.mjs
```

Expected: FAIL because `generateStarHistory` is not exported and the SVG still says `Cumulative GitHub stars`.

- [ ] **Step 3: Implement artifact orchestration**

Add artifact orchestration:

```js
async function readOptional(filePath) {
  try {
    return await readFile(filePath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export async function generateStarHistory({
  repository,
  token,
  dataPath,
  outputPath,
  now = new Date(),
  fetchImpl = fetch
}) {
  const currentData = await readFile(dataPath, 'utf8')
  let parsed
  try {
    parsed = JSON.parse(currentData)
  } catch (error) {
    throw new Error(`Invalid Star History JSON at ${dataPath}`, { cause: error })
  }
  const data = parseStarHistoryData(parsed, repository)
  const count = await fetchStarCount({ repository, token, fetchImpl })
  const date = now.toISOString().slice(0, 10)
  const snapshots = updateDailySnapshots(data.snapshots, date, count)
  const nextData = { repository, snapshots }
  const nextJson = `${JSON.stringify(nextData, null, 2)}\n`
  const nextSvg = renderStarHistorySvg({ repository, series: snapshots })
  const currentSvg = await readOptional(outputPath)
  let changed = false

  if (currentData !== nextJson) {
    await mkdir(path.dirname(dataPath), { recursive: true })
    await writeFile(dataPath, nextJson, 'utf8')
    changed = true
  }
  if (currentSvg !== nextSvg) {
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, nextSvg, 'utf8')
    changed = true
  }
  return changed
}
```

Change the SVG description expression to:

```js
const description = finalPoint
  ? `GitHub star count history from ${formatDate(series[0].date)} to ${updatedLabel}, reaching ${finalCount} stars.`
  : 'No GitHub stars have been recorded yet.'
```

Make `main()` resolve defaults:

```js
const dataPath = path.resolve(process.env.STAR_HISTORY_DATA ?? fileURLToPath(new URL('../assets/star-history-data.json', import.meta.url)))
const outputPath = path.resolve(process.env.STAR_HISTORY_OUTPUT ?? fileURLToPath(new URL('../assets/star-history.svg', import.meta.url)))
await generateStarHistory({ repository, token, dataPath, outputPath })
```

- [ ] **Step 4: Run script tests and verify GREEN**

```bash
node --test scripts/generate-star-history.test.mjs
```

Expected: all tests pass, including idempotent output and decreasing counts.

- [ ] **Step 5: Commit artifact generation**

```bash
git add scripts/generate-star-history.mjs scripts/generate-star-history.test.mjs
git commit -m "fix: generate star chart from daily snapshots"
```

---

### Task 3: Seed data, workflow contract, and release note

**Files:**
- Create: `assets/star-history-data.json`
- Create: `.release-notes/star-history-snapshots.md`
- Modify: `.github/workflows/update-star-history.yml`
- Modify: `scripts/generate-star-history.test.mjs`
- Regenerate: `assets/star-history.svg`

**Interfaces:**
- Consumes: Task 2's production CLI behavior.
- Produces: one anonymous dense UTC baseline from 2026-06-01 through the current date.
- Produces: workflow atomic commit contract for both artifacts.

- [ ] **Step 1: Write the failing workflow contract test**

Replace the old workflow assertions with:

```js
assert.match(workflow, /GITHUB_TOKEN:/)
assert.match(workflow, /node scripts\/generate-star-history\.mjs/)
assert.match(workflow, /git diff --quiet -- assets\/star-history-data\.json assets\/star-history\.svg/)
assert.match(workflow, /git add assets\/star-history-data\.json assets\/star-history\.svg/)
assert.doesNotMatch(workflow, /\/stargazers/)
```

- [ ] **Step 2: Run the test and verify RED**

```bash
node --test scripts/generate-star-history.test.mjs
```

Expected: FAIL because the workflow checks and adds only the SVG.

- [ ] **Step 3: Create the anonymous historical baseline**

Use the two already verified collaborator-authorized API pages only for initialization. Aggregate them without retaining identities:

```bash
gh api 'repos/zszz3/agent-session-search/stargazers?per_page=100&page=1' -H 'Accept: application/vnd.github.star+json' > /tmp/agent-session-search-stargazers-1.json
gh api 'repos/zszz3/agent-session-search/stargazers?per_page=100&page=2' -H 'Accept: application/vnd.github.star+json' > /tmp/agent-session-search-stargazers-2.json
node --input-type=module -e 'import { readFile } from "node:fs/promises"; const pages = await Promise.all([1,2].map((page) => readFile(`/tmp/agent-session-search-stargazers-${page}.json`, "utf8").then(JSON.parse))); const days = pages.flat().map(({ starred_at }) => starred_at.slice(0, 10)).sort(); const counts = new Map(); for (const day of days) counts.set(day, (counts.get(day) ?? 0) + 1); const start = Date.parse(`${days[0]}T00:00:00Z`); const end = Date.parse(`${days.at(-1)}T00:00:00Z`); const snapshots = []; let count = 0; for (let time = start; time <= end; time += 86400000) { const date = new Date(time).toISOString().slice(0, 10); count += counts.get(date) ?? 0; snapshots.push({ date, count }); } console.log(JSON.stringify({ repository: "zszz3/agent-session-search", snapshots }, null, 2));'
```

Copy the deterministic stdout exactly into `assets/star-history-data.json` with a trailing newline. The committed file must have this envelope and end at the metadata total observed during seeding:

```json
{
  "repository": "zszz3/agent-session-search",
  "snapshots": [
    { "date": "2026-06-01", "count": 4 },
    { "date": "2026-06-02", "count": 5 },
    { "date": "2026-06-03", "count": 24 }
  ]
}
```

Include every intervening UTC day by carrying the prior count. Re-fetch repository metadata immediately before committing and require the final snapshot count to equal `stargazers_count`; if it changed, update today's snapshot only.

- [ ] **Step 4: Update the workflow atomically**

Change both commands:

```yaml
if git diff --quiet -- assets/star-history-data.json assets/star-history.svg; then
  echo "Star History has not changed."
  exit 0
fi
```

```yaml
git add assets/star-history-data.json assets/star-history.svg
```

- [ ] **Step 5: Add the user-facing release note**

Create `.release-notes/star-history-snapshots.md`:

```markdown
# Star History 自动更新恢复

## Bug 修复

- 修复 Star History 图表因 GitHub 接口权限变化而停止更新的问题。
```

- [ ] **Step 6: Regenerate artifacts and run focused checks**

```bash
GITHUB_REPOSITORY=zszz3/agent-session-search GITHUB_TOKEN="$(gh auth token)" node scripts/generate-star-history.mjs
node --test scripts/generate-star-history.test.mjs
npm run release-note:check
git diff --check
```

Expected: generator exits 0 using repository metadata, focused tests pass, release note check passes, and no whitespace errors are reported. Do not print or persist the token.

- [ ] **Step 7: Commit workflow and assets**

```bash
git add .github/workflows/update-star-history.yml .release-notes/star-history-snapshots.md assets/star-history-data.json assets/star-history.svg scripts/generate-star-history.test.mjs
git commit -m "fix: restore scheduled star history updates"
```

---

### Task 4: Full verification and live workflow proof

**Files:**
- Verify only; modify code only if a verification failure exposes a root-cause defect and restart the relevant TDD cycle.

**Interfaces:**
- Consumes: complete branch implementation.
- Produces: local regression evidence and one real GitHub Actions run URL.

- [ ] **Step 1: Run fresh local verification**

```bash
npm test -- --run
npm run typecheck
npm run build
npm run release-note:check
git diff --check
git status --short
```

Expected: 0 test failures, typecheck/build/release-note check exit 0, no whitespace errors, and a clean worktree.

- [ ] **Step 2: Push the branch and open a Draft PR**

```bash
git push -u origin fix/star-history-snapshots
gh pr create --draft --base main --head fix/star-history-snapshots --title "fix: restore Star History updates" --body-file /tmp/star-history-pr.md
```

The PR body must include the 403 root cause, snapshot architecture, no-PAT security boundary, red/green tests, complete verification results, and the GitHub changelog link.

- [ ] **Step 3: Obtain live workflow proof without merging**

Because `workflow_dispatch` executes the workflow file from the default branch, do not claim live proof from the fixed branch until the workflow is on `main`. Use one of these honest gates:

1. If the user authorizes merging after PR review, merge and run `gh workflow run update-star-history.yml --ref main`, then inspect with `gh run watch` and `gh run view --log-failed`.
2. If not yet merged, report local metadata smoke-test evidence and explicitly mark live Actions proof as pending merge.

Expected after merge: Generate step accesses `/repos/zszz3/agent-session-search`, not `/stargazers`; run concludes `success`; unchanged snapshots exit cleanly, or changed snapshots produce one bot commit containing both assets.

- [ ] **Step 4: Update durable project memory**

Update `/Users/xjx/Documents/Obsidian Vault/Codex/projects/agent-session-search.md` with the implementation, verification, PR/run links, and remaining live-proof status. Update `/Users/xjx/Documents/Obsidian Vault/Codex/TODO.md` to close or retain the workflow follow-up accurately.
