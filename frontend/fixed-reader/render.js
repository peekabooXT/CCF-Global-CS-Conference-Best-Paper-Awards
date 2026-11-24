import { translate } from '../src/translate.js'
import { affiliationText, authorText } from '../src/paperOverview.js'
import { externalPaperUrl, externalUrl, scholarUrl, sourceUrl } from '../src/paperLinks.js'
import { matchRanges } from './matches.js'

const english = {
  '按会议、年份、奖项筛选获奖论文。': 'Filter award-winning papers by conference, year, and award.',
  '按会议和年份浏览奖项与已收录的获奖论文。': 'Browse awards and indexed winning papers by conference and year.',
  '按题名、作者、单位和发表日期检索。': 'Search by title, author, affiliation, and publication date.',
  '数据更新': 'Data updated', '搜索论文': 'Search papers',
  '输入论文题名、作者、单位或奖项': 'Enter a paper title, author, affiliation, or award',
  '输入会议简称，可点选多个': 'Enter a conference acronym to select one or more',
  '匹配会议': 'Matching conferences', '匹配会议已选中': 'Matching conferences are already selected',
  '原文证据片段': 'Original evidence excerpts',
  '来源': 'Source',
  '开始年份': 'First year', '结束年份': 'Last year', '排序': 'Sort by', '全部会议': 'All conferences',
  '关键词': 'Keywords', '页码': 'Page number', '每页篇数': 'Papers per page', '上一页': 'Previous', '下一页': 'Next', '跳转': 'Go',
  '关闭': 'Close', '服务计算与软件服务新技术': 'Service Computing & Novel Software Service Technologies',
  '湖南省重点实验室': 'Hunan Provincial Key Laboratory', '未找到该会议简称': 'Conference acronym not found',
  '没有符合条件的结果': 'No matching results', '会议数量': 'Conferences', '正在打开详情…': 'Opening details…',
  '详情暂时无法读取': 'Details could not be opened', '起始日期不能晚于结束日期': 'The start date must not be after the end date',
}

export const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char])
export const label = (value, language) => language === 'en' ? english[value] || translate(value, 'en') : value

export function markMatches(value, terms = []) {
  const text = String(value ?? '')
  const ranges = matchRanges(text, terms)
  let html = '', offset = 0
  for (const [start, end] of ranges) {
    html += `${esc(text.slice(offset, start))}<mark class="search-match">${esc(text.slice(start, end))}</mark>`
    offset = end
  }
  return html + esc(text.slice(offset))
}

export function link(url, text, className = '', terms) {
  if (!url) return ''
  return `<a class="${esc(className)}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${markMatches(text, terms)}</a>`
}

export function itemCount(total, type, language) {
  const formatted = total.toLocaleString(language === 'en' ? 'en' : 'zh-CN')
  if (type === 'events') return language === 'en' ? `${formatted} annual award records` : `${formatted} 条会议年度奖项记录`
  return language === 'en' ? `${formatted} papers` : `${formatted} 篇论文`
}

export function overviewScope(stats, language) {
  if (!stats.records) return ''
  const conferences = language === 'en' ? `${stats.conferences} conferences` : `${stats.conferences} 个会议`
  return stats.yearFrom == null ? conferences : `${conferences} · ${stats.yearFrom}–${stats.yearTo}`
}

export function paperRow(record, language, terms = {}) {
  const t = value => esc(label(value, language))
  const unit = affiliationText(record)
  const category = (record.category_labels || [record.category_label]).map(value => markMatches(label(value, language), terms.award)).join(' / ')
  const title = link(scholarUrl(record), record.title, 'paper-title', terms.title) || markMatches(record.title, terms.title)
  return `<tr data-paper="${esc(record.id)}"><td><strong>${markMatches(record.acronym, terms.venue)}</strong><span class="subline">${esc(record.year)}${record.rank ? ` · CCF-${esc(record.rank)}` : ''}</span></td>
<td>${title}</td><td><span class="clamp">${markMatches(authorText(record), terms.author) || t('作者未提供')}</span>${unit ? `<span class="subline clamp">${markMatches(unit, terms.unit)}</span>` : ''}</td>
<td>${category}<span class="subline clamp">${markMatches(record.award_name, terms.award) || t('来源未提供')}</span></td>
<td class="verified">${t('已核验')}</td><td><div class="row-links">${link(externalPaperUrl(record), label('外部论文 ↗', language))}${link(sourceUrl(record), label('来源 ↗', language))}<button type="button" class="link-button" data-detail="paper" data-id="${esc(record.id)}">${t('详情')}</button></div></td></tr>`
}

export function eventRow(event, language, terms = {}) {
  const t = value => esc(label(value, language))
  return `<tr data-event="${esc(event.id)}"><td>${esc(event.year)}</td><td><strong>${markMatches(event.venue, terms.venue)}</strong>${event.rank ? ` <span class="subline">CCF-${esc(event.rank)}</span>` : ''}</td>
<td>${markMatches(event.official_award_name, terms.award)}</td><td>${t(event.category_label)}</td><td>${esc(event.paper_count)}</td><td class="verified">${t('已核验')}</td>
<td><button type="button" class="link-button" data-detail="event" data-id="${esc(event.id)}">${t('查看')}</button></td></tr>`
}

function evidence(items, summary) {
  if (!items?.length) return ''
  return `<details><summary>${esc(summary)} (${items.length})</summary><ul>${items.map(item => `<li>${esc(item.relation)} · ${esc(item.quote)}</li>`).join('')}</ul></details>`
}

export function paperDetail(record, data, language, terms = {}) {
  const t = value => esc(label(value, language))
  const authors = authorText(record) || label('作者未提供', language)
  const affiliations = affiliationText(record)
  const listings = data.listings || []
  const sources = [...new Set((record.sources || []).map(source => externalUrl(source.url)).filter(Boolean))]
  const awards = data.awards || []
  return `<h3>${markMatches(record.title, terms.title)}</h3><p class="muted">${markMatches(record.acronym, terms.venue)} · ${esc(record.year)}${record.rank ? ` · CCF-${esc(record.rank)}` : ''} · ${t('已核验')}</p>
<p><strong>${t('奖项原名')}</strong> ${markMatches(record.award_name, terms.award) || t('来源未提供')}</p>
<p><strong>${t('作者')}</strong> ${markMatches(authors, terms.author)}</p>${affiliations ? `<p><strong>${t('作者单位')}</strong> ${markMatches(affiliations, terms.unit)}</p>` : ''}
${record.authors?.some(author => author.affiliations?.length) ? `<details><summary>${t('作者及单位')}</summary><ul>${record.authors.map(author => `<li>${esc(author.name)} · ${esc(author.affiliations?.map(affiliation => affiliation.name).join(' · ')) || t('未知')}</li>`).join('')}</ul></details>` : ''}
${record.publication_date ? `<p><strong>${t('发表日期')}</strong> ${esc(record.publication_date)}</p>` : ''}
<p>${link(scholarUrl(record, listings), 'Google Scholar ↗')} ${link(externalPaperUrl(record), label('外部论文 / 出版页面 ↗', language))}</p>
<h3>${t('来源与收录依据')}</h3><ul>${sources.map((url, index) => `<li>${link(url, `${label('来源', language)} ${index + 1} ↗`)}</li>`).join('')}</ul>
${listings.map(item => `<article><strong>${esc(item.source_name === 'jeffhuang' ? label('JeffHuang 最佳论文汇总', language) : item.source_name)}</strong>
<p>${esc(item.source_venue)} · ${esc(item.year)} · ${esc(item.title)}</p>${item.authors_raw ? `<p>${esc(item.authors_raw)}</p>` : ''}
<p>${link(externalUrl(item.source_url), label('打开收录来源 ↗', language))}</p></article>`).join('')}
${evidence(data.record?.evidence, label('原文证据片段', language))}
<details><summary>${t('查看字段证据及原始记录')}</summary><pre>${esc(JSON.stringify({ record: data.record || record, awards, listings }, null, 2))}</pre></details>`
}

export function eventDetail(event, language, terms = {}) {
  const t = value => esc(label(value, language))
  return `<h3>${markMatches(event.official_award_name, terms.award)}</h3><p>${markMatches(event.venue, terms.venue)} · ${esc(event.year)} · ${t(event.category_label)}</p>
${(event.papers || []).map(paper => `<article><h3>${markMatches(paper.title, terms.title)}</h3><p>${esc(paper.authors_raw) || t('作者未提供')}</p>
<p>${link(scholarUrl(paper), 'Google Scholar ↗')} ${link(externalPaperUrl(paper), label('外部论文 / 出版页面 ↗', language))} ${link(externalUrl(paper.source_url), label('奖项来源页', language))}</p>
${paper.note ? `<p>${esc(paper.note)}</p>` : ''}${evidence(paper.evidence, label('原文证据片段', language))}</article>`).join('')}`
}
