import { fold } from '../src/staticSearch.js'

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

// Map the normalized text used by search back to the original spelling.
export function matchRanges(text, terms) {
  if (!terms.length) return []
  const keys = [...new Set(terms.map(fold).filter(Boolean))]
  const searchText = fold(text)
  const matching = keys.filter(key => searchText.includes(key))
  if (!matching.length) return []

  const segments = segmenter?.segment(text) ?? [...text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)].map(match => ({ segment: match[0], index: match.index }))
  const offsets = []
  for (const { segment, index } of segments) {
    const end = index + segment.length
    if (/^\s+$/u.test(segment)) {
      if (!offsets.length) continue
      if (offsets.at(-1).space) offsets.at(-1).end = end
      else offsets.push({ start: index, end, space: true })
      continue
    }
    const length = fold(segment).length
    for (let unit = 0; unit < length; unit++) offsets.push({ start: index, end })
  }

  const ranges = []
  for (const term of matching) {
    for (let start = searchText.indexOf(term); start !== -1; start = searchText.indexOf(term, start + term.length)) {
      const first = offsets[start]
      const last = offsets[start + term.length - 1]
      if (first && last) ranges.push([first.start, last.end])
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged = []
  for (const [start, end] of ranges) {
    const previous = merged.at(-1)
    if (previous && start < previous[1]) previous[1] = Math.max(previous[1], end)
    else merged.push([start, end])
  }
  return merged
}
