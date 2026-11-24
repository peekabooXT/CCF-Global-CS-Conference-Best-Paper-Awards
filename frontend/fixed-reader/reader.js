import { decodeCatalog, fold, searchStaticEvents, searchStaticPapers } from '../src/staticSearch.js'
import { overviewCsv, overviewRows, overviewStats } from '../src/paperOverview.js'
import { DEFAULT_PAGE_SIZE, DEFAULT_OVERVIEW_PAGE_SIZE } from '../src/pagination.js'
import { esc, eventDetail, eventRow, itemCount, label, markMatches, overviewScope, paperDetail, paperRow } from './render.js'

const $ = id => document.getElementById(id)
const elements = [...document.querySelectorAll('[data-i18n], [data-i18n-placeholder], [data-i18n-aria], [data-i18n-alt]')].map(element => {
  const attribute = element.hasAttribute('data-i18n-placeholder') ? 'placeholder'
    : element.hasAttribute('data-i18n-aria') ? 'aria-label' : element.hasAttribute('data-i18n-alt') ? 'alt' : null
  return { element, attribute, source: attribute ? element.getAttribute(attribute) : element.textContent }
})
const state = {
  overview: { page: 1, size: DEFAULT_OVERVIEW_PAGE_SIZE },
  events: { page: 1, size: 50 },
  search: { page: 1, size: DEFAULT_PAGE_SIZE },
}
const chosen = new Set()
const dialog = $('detail')
const detailFiles = new Map()
let data, rows, allPapers, conferenceAcronyms, active = 'overview', language = 'zh', detailVersion = 0

const snapshot = () => data ||= JSON.parse($('reader-data').textContent)
const atoms = () => rows ||= decodeCatalog(snapshot().catalog)
const papers = () => allPapers ||= searchStaticPapers(atoms()).records
const t = value => label(value, language)
const viewFromHash = () => Object.hasOwn(state, location.hash.slice(1)) ? location.hash.slice(1) : 'overview'
const formFor = view => document.querySelector(`[data-filters="${view}"]`)
const pagerFor = view => document.querySelector(`[data-pager="${view}"]`)

function getFilters(view) {
  const values = Object.fromEntries([...new FormData(formFor(view))].map(([key, value]) => [key, value.trim()]))
  for (const key of ['year_from', 'year_to']) if (key in values) values[key] = values[key] ? Number(values[key]) : null
  return values
}

function updateResults(view) {
  const filters = getFilters(view)
  const badYear = filters.year_from != null && filters.year_to != null && filters.year_from > filters.year_to
  const badDate = filters.published_from && filters.published_to && filters.published_from > filters.published_to
  const error = badYear ? '起始年份不能晚于结束年份' : badDate ? '起始日期不能晚于结束日期' : ''
  const current = state[view]
  current.terms = resultTerms(view, filters)
  current.message = error
  if (error) current.results = []
  else if (view === 'overview') {
    const query = fold(filters.conference_query)
    const conferences = chosen.size ? [...chosen] : matchConferences(query)
    current.results = query && !conferences.length ? [] : overviewRows(papers(), { ...filters, conferences }, filters.sort)
  }
  else if (view === 'events') current.results = searchStaticEvents(snapshot().events, { ...filters, limit: snapshot().events.length }).events
  else current.results = searchStaticPapers(atoms(), filters).records
}

function resultTerms(view, filters) {
  if (view === 'search') return { title: [filters.title], author: [filters.author], unit: [filters.affiliation] }
  if (view === 'events') return { venue: [filters.venue], award: [filters.query], title: [filters.query] }
  const words = fold(filters.query).split(' ').filter(Boolean)
  return {
    title: words, author: words, unit: words, award: words,
    venue: chosen.size ? [] : [filters.conference_query],
  }
}

function pageResults(view, refresh = false) {
  const current = state[view]
  if (refresh || !current.results) updateResults(view)
  const total = current.results.length
  const last = Math.max(1, Math.ceil(total / current.size))
  current.page = Math.min(last, Math.max(1, current.page))
  const start = (current.page - 1) * current.size
  const visible = current.results.slice(start, start + current.size)
  const render = view === 'events' ? eventRow : paperRow
  $(`${view}-rows`).innerHTML = visible.length ? visible.map(row => render(row, language, current.terms)).join('')
    : `<tr><td class="empty" colspan="${view === 'events' ? 7 : 6}">${esc(t(current.message || '没有符合条件的结果'))}</td></tr>`
  $(`${view}-count`).textContent = itemCount(total, view, language)
  if (view === 'overview') $('overview-scope').textContent = overviewScope(overviewStats(current.results), language)
  updatePager(view, total, last)
  const button = document.querySelector(`[data-export="${view}"]`)
  if (button) button.disabled = total === 0
}

function updatePager(view, total, last) {
  const current = state[view]
  const pager = pagerFor(view)
  pager.querySelector('[data-page-label]').textContent = `${current.page} / ${last}`
  pager.querySelector('[name=page]').max = last
  pager.querySelector('[name=page]').value = current.page
  pager.querySelector('[data-step="-1"]').disabled = current.page <= 1
  pager.querySelector('[data-step="1"]').disabled = current.page >= last
  pager.querySelector('[data-range]').textContent = total ? `${(current.page - 1) * current.size + 1}–${Math.min(total, current.page * current.size)}` : '0'
}

function changeLanguage(next, repaint = true) {
  language = next
  document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN'
  for (const { element, attribute, source } of elements) {
    if (attribute) element.setAttribute(attribute, t(source))
    else element.textContent = t(source)
  }
  for (const button of document.querySelectorAll('[data-lang]')) button.setAttribute('aria-pressed', String(button.dataset.lang === next))
  try { localStorage.setItem('ccf-awards-language', next) } catch { /* file URLs can deny storage */ }
  if (repaint) {
    if (active === 'overview') showConferenceMatches()
    pageResults(active)
  }
}

function showView(view, useFirstPage = false) {
  active = view
  for (const name of Object.keys(state)) $(name).hidden = name !== view
  for (const link of document.querySelectorAll('.navigation a')) {
    if (link.hash === `#${view}`) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  }
  if (!useFirstPage) pageResults(view)
}

function matchConferences(query) {
  if (!query) return []
  conferenceAcronyms ||= [...new Set(papers().map(row => row.acronym))].map(acronym => ({ acronym, key: fold(acronym) }))
  const matches = conferenceAcronyms.filter(({ key }) => key.includes(query))
  matches.sort((a, b) => Number(b.key === query) - Number(a.key === query) ||
    Number(b.key.startsWith(query)) - Number(a.key.startsWith(query)) || a.acronym.localeCompare(b.acronym, 'en'))
  return matches.map(({ acronym }) => acronym)
}

function showConferenceMatches() {
  const query = fold($('conference-query').value)
  const group = $('conference-matches')
  group.hidden = !query
  if (!query) {
    group.replaceChildren()
    return
  }
  const matches = matchConferences(query)
  const options = matches.filter(acronym => !chosen.has(acronym)).slice(0, 8)
  group.innerHTML = options.length
    ? `<span>${esc(t('匹配会议'))}</span>${options.map(acronym => `<button type="button" data-add-conference="${esc(acronym)}">${markMatches(acronym, [query])}</button>`).join('')}`
    : `<span>${esc(t(matches.length ? '匹配会议已选中' : '未找到该会议简称'))}</span>`
}

function updateConferences() {
  $('selected-conferences').innerHTML = [...chosen].map(acronym => `<button type="button" data-remove="${esc(acronym)}" aria-label="${esc(acronym)} ×">${esc(acronym)} ×</button>`).join('')
  showConferenceMatches()
  state.overview.page = 1
  pageResults('overview', true)
}

function addConference(acronym) {
  const input = $('conference-query')
  chosen.add(acronym)
  input.value = ''
  updateConferences()
  input.focus()
}

function download(view) {
  if (!state[view].results) updateResults(view)
  const url = URL.createObjectURL(new Blob([overviewCsv(state[view].results, snapshot().meta.statuses, language)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `paper-${view}-${language}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function loadDetails(path) {
  if (!path) return Promise.reject(new Error('Missing detail chunk'))
  if (!detailFiles.has(path)) {
    detailFiles.set(path, new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = path
      script.onload = () => {
        script.remove()
        const value = window.awardsDetails?.[path]
        if (value) resolve(value)
        else reject(new Error('Empty detail chunk'))
      }
      script.onerror = () => { script.remove(); reject(new Error('Missing detail chunk')) }
      document.head.append(script)
    }).catch(error => { detailFiles.delete(path); throw error }))
  }
  return detailFiles.get(path)
}

async function openDetail(kind, id) {
  const version = ++detailVersion
  const terms = state[active].terms
  $('detail-title').textContent = t('详情')
  $('detail-body').textContent = t('正在打开详情…')
  dialog.showModal()
  try {
    const config = snapshot()
    let html
    if (kind === 'event') {
      const event = config.events.find(row => row.id === id)
      const chunk = await loadDetails(config.eventChunks[event._chunk])
      html = eventDetail(chunk[id], language, terms)
    } else {
      const paper = state[active].results?.find(row => row.id === id) || papers().find(row => row.id === id)
      const chunk = await loadDetails(config.paperChunks[Math.floor(paper._group / config.paperChunkSize)])
      const detail = chunk[paper._group]
      html = paperDetail(detail.record, detail, language, terms)
    }
    if (dialog.open && version === detailVersion) $('detail-body').innerHTML = html
  } catch {
    if (dialog.open && version === detailVersion) $('detail-body').textContent = t('详情暂时无法读取')
  }
}

for (const view of Object.keys(state)) {
  const filters = formFor(view)
  filters.addEventListener('submit', event => event.preventDefault())
  filters.addEventListener('reset', () => {
    if (view === 'overview') chosen.clear()
    setTimeout(() => {
      if (view === 'overview') updateConferences()
      else { state[view].page = 1; pageResults(view, true) }
    })
  })
  const updateOnInput = event => {
    if (!event.target.name || event.isComposing) return
    if (event.target.name === 'conference_query') showConferenceMatches()
    state[view].page = 1
    pageResults(view, true)
  }
  filters.addEventListener('input', updateOnInput)
  filters.addEventListener('compositionend', updateOnInput)
  const pager = pagerFor(view)
  pager.addEventListener('submit', event => {
    event.preventDefault()
    state[view].page = Number(pager.elements.page.value) || 1
    pageResults(view)
  })
  pager.querySelector('[name=size]')?.addEventListener('change', event => {
    state[view].size = Number(event.target.value)
    state[view].page = 1
    pageResults(view)
  })
  for (const button of pager.querySelectorAll('[data-step]')) button.addEventListener('click', () => {
    state[view].page += Number(button.dataset.step)
    pageResults(view)
  })
}

$('conference-query').addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.isComposing) return
  event.preventDefault()
  const query = fold(event.target.value)
  const matches = matchConferences(query)
  const exact = matches.find(acronym => fold(acronym) === query)
  if (exact || matches.length === 1) addConference(exact || matches[0])
})
document.querySelector('[data-expand]').addEventListener('change', event => {
  $('overview').classList.toggle('expanded', event.target.checked)
})
document.addEventListener('click', event => {
  const button = event.target.closest('button')
  if (!button) return
  if (button.dataset.lang) {
    changeLanguage(button.dataset.lang)
    if (location.protocol !== 'file:' && new URLSearchParams(location.search).has('lang')) {
      const url = new URL(location.href)
      url.searchParams.set('lang', language)
      history.replaceState(null, '', url)
    }
  }
  if (button.dataset.addConference) addConference(button.dataset.addConference)
  if (button.dataset.remove) { chosen.delete(button.dataset.remove); updateConferences() }
  if (button.dataset.export) download(button.dataset.export)
  if (button.dataset.detail) openDetail(button.dataset.detail, button.dataset.id)
})
window.addEventListener('hashchange', () => showView(viewFromHash()))
const requested = new URLSearchParams(location.search).get('lang')
let saved
try { saved = localStorage.getItem('ccf-awards-language') } catch { /* optional preference */ }
const initialLanguage = ['zh', 'zh-CN', 'en'].includes(requested) ? requested : saved
changeLanguage(initialLanguage === 'en' ? 'en' : 'zh', false)
showView(viewFromHash(), viewFromHash() === 'overview' && language === 'zh')
