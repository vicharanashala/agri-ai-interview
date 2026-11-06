import { useEffect, useRef } from 'react'

// Phones, tablets and any touch screen. Desktop layouts never read the values set below.
const MOBILE_QUERY = '(max-width: 1023px), (pointer: coarse)'

// Below these visible heights (landscape, or keyboard open) the interview uses compact layouts
const SHORT_VIEWPORT_PX = 500
const TINY_VIEWPORT_PX = 240

/**
 * Publishes the area of the screen actually visible to the candidate as CSS values, because on-screen
 * keyboards shrink only the visual viewport on iOS Safari and (by default) Android Chrome:
 *   --interview-vh, --interview-vv-top, and html[data-interview-viewport="normal|short|tiny"].
 * onHeightChange runs when the visible height changes (keyboard opened or closed, screen rotated).
 */
export function useVisualViewportVars(onHeightChange?: () => void) {
  const onHeightChangeRef = useRef(onHeightChange)
  onHeightChangeRef.current = onHeightChange

  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport
    const mobile = window.matchMedia(MOBILE_QUERY)
    let lastHeight = -1

    const clear = () => {
      root.style.removeProperty('--interview-vh')
      root.style.removeProperty('--interview-vv-top')
      delete root.dataset.interviewViewport
      lastHeight = -1
    }

    const update = () => {
      if (!mobile.matches) {
        clear()
        return
      }
      // A pinch zoom also shrinks the visual viewport; keep the layout steady while zoomed
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return

      const height = Math.round(viewport?.height ?? window.innerHeight)
      root.style.setProperty('--interview-vh', `${height}px`)
      root.style.setProperty('--interview-vv-top', `${Math.round(viewport?.offsetTop ?? 0)}px`)
      root.dataset.interviewViewport =
        height < TINY_VIEWPORT_PX ? 'tiny' : height <= SHORT_VIEWPORT_PX ? 'short' : 'normal'

      if (height !== lastHeight) {
        if (lastHeight !== -1) onHeightChangeRef.current?.()
        lastHeight = height
      }
    }

    // iOS reports the new size slightly after the rotation event
    let rotationTimer: ReturnType<typeof setTimeout> | undefined
    const onRotate = () => {
      update()
      clearTimeout(rotationTimer)
      rotationTimer = setTimeout(update, 300)
    }

    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', onRotate)

    return () => {
      clearTimeout(rotationTimer)
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', onRotate)
      clear()
    }
  }, [])
}
