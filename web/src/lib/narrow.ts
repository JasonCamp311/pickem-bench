// Phone-width helpers. The wide tables turn into stacked lists below NARROW,
// and the tab and chip rows turn into strips that scroll sideways.

import { useEffect, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'

// Keep in step with the max-width query in index.css.
const NARROW = '(max-width: 720px)'

const subscribe = (cb: () => void) => {
  const q = window.matchMedia(NARROW)
  q.addEventListener('change', cb)
  return () => q.removeEventListener('change', cb)
}

export const useNarrow = () => useSyncExternalStore(subscribe, () => window.matchMedia(NARROW).matches)

// For a strip that scrolls sideways: keeps the pressed button centered and sets
// data-more while there is more to the right, so the CSS can fade that edge.
// Only the strip moves; the page never scrolls because of this.
export function useStrip(ref: RefObject<HTMLElement | null>, active: unknown) {
  useEffect(() => {
    const el = ref.current
    const on = el?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!el || !on || el.scrollWidth <= el.clientWidth) return
    const left = on.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft
    el.scrollTo({ left: left - (el.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' })
  }, [ref, active])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const mark = () => el.toggleAttribute('data-more', el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    mark()
    el.addEventListener('scroll', mark, { passive: true })
    const watcher = new ResizeObserver(mark)
    watcher.observe(el)
    return () => {
      el.removeEventListener('scroll', mark)
      watcher.disconnect()
    }
  }, [ref])
}
