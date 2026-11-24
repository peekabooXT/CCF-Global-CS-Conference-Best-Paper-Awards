import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { decodeCatalog, searchStaticPapers } from './src/staticSearch.js'
import { overviewRows, overviewStats } from './src/paperOverview.js'
import { DEFAULT_PAGE_SIZE, DEFAULT_OVERVIEW_PAGE_SIZE, PAGE_SIZES } from './src/pagination.js'
import { esc, itemCount, overviewScope, paperRow } from './fixed-reader/render.js'

const root = fileURLToPath(new URL('.', import.meta.url))
const dist = resolve(process.argv[2] || join(root, 'dist'))
const assets = join(dist, 'assets')
const template = join(root, 'fixed-reader')
const json = data => JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')
const title = 'CCF Global CS Conference Best Paper Awards'

function moduleValue(source) {
  const match = source.match(/^export default ([\s\S]*);\s*$/)
  if (!match) throw new Error('Invalid static data module')
  return JSON.parse(match[1])
}

async function readStatic(reference) {
  if (!/^assets\/static-[a-z0-9-]+\.js$/.test(reference)) throw new Error(`Unexpected static path: ${reference}`)
  return moduleValue(await readFile(join(dist, reference), 'utf8'))
}

async function readPlain(reference) {
  const packed = await readStatic(reference)
  return readStatic(packed.fallback)
}

async function makeDetailScripts(chunks, kind) {
  const output = {}
  for (const [index, reference] of Object.entries(chunks)) {
    const data = json(await readPlain(reference))
    const hash = createHash('sha256').update(data).digest('hex').slice(0, 16)
    const name = `assets/fixed-${kind}-${index}-${hash}.js`
    await writeFile(join(dist, name), `globalThis.awardsDetails ??= Object.create(null);\nglobalThis.awardsDetails[${json(name)}] = ${data};\n`)
    output[index] = name
  }
  return output
}

async function copyLogo(name) {
  const content = await readFile(join(root, 'src/assets', name))
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16)
  const file = `assets/fixed-${hash}-${name}`
  await writeFile(join(dist, file), content)
  return file
}

function input(name, label, type = 'search', extra = '') {
  return `<label class="field"><span data-i18n>${esc(label)}</span><input name="${name}" type="${type}" ${extra}></label>`
}
function select(name, label, options, localize = true) {
  return `<label class="field"><span data-i18n>${esc(label)}</span><select name="${name}">${options.map(([value, text]) =>
    `<option value="${esc(value)}"${localize ? ' data-i18n' : ''}>${esc(text)}</option>`).join('')}</select></label>`
}
const reset = '<div class="form-actions"><button type="reset" data-i18n>重置条件</button></div>'
const headings = labels => `<tr>${labels.map(text => `<th scope="col" data-i18n>${esc(text)}</th>`).join('')}</tr>`
const yearFields = () => input('year_from', '开始年份', 'number', 'min="1900" max="2200"') + input('year_to', '结束年份', 'number', 'min="1900" max="2200"')

function pager(view, initialSize, total) {
  const size = view === 'events' ? '' : `<label><span data-i18n>每页篇数</span> <select name="size" aria-label="每页篇数" data-i18n-aria>${PAGE_SIZES.map(n => `<option value="${n}"${n === initialSize ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`
  const last = Math.max(1, Math.ceil(total / initialSize))
  return `<form class="pager" data-pager="${view}" aria-label="论文分页" data-i18n-aria>
    <span data-range>${total ? `1–${Math.min(total, initialSize)}` : '0'}</span>${size}
    <button type="button" data-step="-1" aria-label="上一页" data-i18n-aria disabled>‹</button>
    <span data-page-label>1 / ${last}</span>
    <button type="button" data-step="1" aria-label="下一页" data-i18n-aria${last === 1 ? ' disabled' : ''}>›</button>
    <input name="page" type="number" min="1" max="${last}" value="1" aria-label="页码" data-i18n-aria>
    <button type="submit" data-i18n>跳转</button></form>`
}

const source = await readFile(join(dist, 'index.html'), 'utf8')
const metaBlock = source.match(/<script id="awards-static-data" type="application\/json">([\s\S]*?)<\/script>/)
if (!metaBlock) throw new Error('Generate the reviewed static data before building the fixed reader.')
const bootstrap = JSON.parse(metaBlock[1])
const catalog = await readPlain(bootstrap.catalog)
const rows = overviewRows(searchStaticPapers(decodeCatalog(catalog)).records)
const events = await readPlain(bootstrap.events)
if (rows.length !== bootstrap.meta.publication.paper_results) throw new Error('Fixed reader paper count differs from the published data.')
await mkdir(assets, { recursive: true })
const [paperChunks, eventChunks, university, college] = await Promise.all([
  makeDetailScripts(bootstrap.paper_chunks, 'papers'), makeDetailScripts(bootstrap.event_chunks, 'events'),
  copyLogo('hnust.svg'), copyLogo('hnust-computer.png'),
])
const readerFiles = new Set([...Object.values(paperChunks), ...Object.values(eventChunks), university, college])
for (const file of await readdir(assets)) {
  if (file.startsWith('fixed-') && !readerFiles.has(`assets/${file}`)) await rm(join(assets, file))
}

const bundle = await build({
  entryPoints: [join(template, 'reader.js')], bundle: true, write: false, format: 'iife', minify: true, target: 'es2022',
})
const tier = () => select('rank', 'CCF 等级', [['', '全部等级'], ['A', 'CCF A'], ['B', 'CCF B']])
const category = () => select('category', '奖项分类', [['', '全部分类'], ...Object.entries(bootstrap.meta.award_categories)])
const catalogConferences = bootstrap.meta.conferences.toSorted((a, b) => a.acronym.localeCompare(b.acronym, 'en'))
const tokens = {
  CSS: await readFile(join(template, 'reader.css'), 'utf8'),
  JS: bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'),
  DATA: json({
    catalog, events, paperChunks, eventChunks, paperChunkSize: bootstrap.paper_chunk_size,
    meta: { statuses: bootstrap.meta.statuses, publication: bootstrap.meta.publication },
  }),
  DATE: esc(bootstrap.meta.publication.published_at || ''),
  FIRST_PAPERS: rows.slice(0, DEFAULT_OVERVIEW_PAGE_SIZE).map(row => paperRow(row, 'zh')).join('\n'),
  OVERVIEW_COUNT: itemCount(rows.length, 'overview', 'zh'), OVERVIEW_SCOPE: overviewScope(overviewStats(rows), 'zh'),
  OVERVIEW_FIELDS: tier() + category() + yearFields()
    + select('sort', '排序', [['conference', '会议 A–Z / 年份倒序'], ['year', '年份从新到旧'], ['title', '论文题名 A–Z']]) + reset,
  EVENT_FIELDS: input('venue', '会议') + category() + input('query', '奖项 / 论文') + reset,
  SEARCH_FIELDS: select('conference', '会议', [['', '全部会议'], ...catalogConferences.map(c => [c.id, `${c.acronym} · CCF ${c.rank}`])])
    + tier() + category() + yearFields() + input('title', '论文题名') + input('author', '作者') + input('affiliation', '作者单位')
    + input('published_from', '起始日期', 'date') + input('published_to', '结束日期', 'date') + reset,
  PAPER_COLS: '<colgroup><col style="width:9%"><col style="width:33%"><col style="width:24%"><col style="width:20%"><col style="width:6%"><col style="width:8%"></colgroup>',
  PAPER_HEAD: headings(['会议 / 年份', '论文题名', '作者 / 单位', '分类 / 奖项原名', '状态', '链接']),
  EVENT_HEAD: headings(['年份', '会议', '原始奖项名称', '统一分类', '已收录获奖论文数', '状态', '操作']),
  OVERVIEW_PAGER: pager('overview', DEFAULT_OVERVIEW_PAGE_SIZE, rows.length),
  EVENT_PAGER: pager('events', 50, events.length),
  SEARCH_PAGER: pager('search', DEFAULT_PAGE_SIZE, rows.length),
  UNIVERSITY: university, COLLEGE: college,
}
const html = (await readFile(join(template, 'index.html'), 'utf8')).replace(/%%([A-Z_]+)%%/g, (_, key) => {
  if (!(key in tokens)) throw new Error(`Missing template value: ${key}`)
  return tokens[key]
})
if (!html.includes(`<title>${title}</title>`)) throw new Error('Unexpected reader title.')
await writeFile(join(dist, 'index.html'), html)
console.log(`Fixed reader: ${rows.length} papers, ${events.length} award records, ${readerFiles.size + 1} files.`)
