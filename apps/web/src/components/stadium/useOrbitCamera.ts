import { useCallback, useEffect, useRef } from 'react';

// ─── Pure camera math ─────────────────────────────────────────────────────────

export interface CamState {
  tilt: number
  orbit: number
  zoom: number
  panX: number
  panY: number
}

export const CAM_DEFAULTS: CamState = { tilt: 38, orbit: -20, zoom: 0.9, panX: 0, panY: 0 };

export const TILT_MIN = 10;
export const TILT_MAX = 75;
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2.2;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function orbitDelta(c: CamState, dx: number, dy: number): CamState {
  return {
    ...c,
    orbit: c.orbit + dx * 0.4,
    tilt: clamp(c.tilt - dy * 0.3, TILT_MIN, TILT_MAX),
  };
}

export function panDelta(c: CamState, dx: number, dy: number): CamState {
  return { ...c, panX: c.panX + dx, panY: c.panY + dy };
}

export function zoomDelta(c: CamState, wheelDeltaY: number): CamState {
  return { ...c, zoom: clamp(c.zoom * Math.exp(-wheelDeltaY * 0.001), ZOOM_MIN, ZOOM_MAX) };
}

export function pinchZoom(c: CamState, distRatio: number): CamState {
  return { ...c, zoom: clamp(c.zoom * distRatio, ZOOM_MIN, ZOOM_MAX) };
}

export function camTransform(c: CamState): string {
  return `translate(${c.panX}px, ${c.panY}px) scale(${c.zoom}) rotateX(${c.tilt}deg) rotateZ(${c.orbit}deg)`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const DRAG_THRESHOLD = 5;

/**
 * Pointer-driven orbit camera. Camera state lives in refs and is written to the
 * world element's style via requestAnimationFrame — no React re-renders during
 * interaction. Left-drag orbits, shift/right-drag pans, wheel and pinch zoom.
 */
export function useOrbitCamera() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const cam = useRef<CamState>({ ...CAM_DEFAULTS });
  const suppressClickRef = useRef(false);
  const rafId = useRef(0);

  const apply = useCallback(() => {
    rafId.current = 0;
    const el = worldRef.current;
    if (el) { el.style.transform = camTransform(cam.current); }
  }, []);

  const schedule = useCallback(() => {
    if (!rafId.current) { rafId.current = window.requestAnimationFrame(apply); }
  }, [apply]);

  const reset = useCallback(() => {
    cam.current = { ...CAM_DEFAULTS };
    const el = worldRef.current;
    if (el) {
      el.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
      window.setTimeout(() => { el.style.transition = ''; }, 450);
    }
    apply();
  }, [apply]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) { return; }
    apply();

    const pointers = new Map<number, { x: number, y: number }>();
    let mode: 'orbit' | 'pan' = 'orbit';
    let moved = 0;
    let pinchDist = 0;

    const pinchDistance = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    const onDown = (e: PointerEvent) => {
      // Do NOT capture the pointer here: capturing retargets the eventual
      // click to the viewport, which would swallow stand-selection clicks.
      // Capture happens in onMove once an actual drag starts.
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        suppressClickRef.current = false;
        moved = 0;
        mode = e.button === 2 || e.shiftKey ? 'pan' : 'orbit';
      } else if (pointers.size === 2) {
        pinchDist = pinchDistance();
      }
    };

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) { return; }
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > DRAG_THRESHOLD && !suppressClickRef.current) {
        suppressClickRef.current = true;
        for (const id of pointers.keys()) { vp.setPointerCapture?.(id); }
      }

      if (pointers.size === 2) {
        // pinch zoom + two-finger pan (midpoint delta ≈ dx/2, dy/2 per pointer)
        const dist = pinchDistance();
        if (pinchDist > 0 && dist > 0) {
          cam.current = pinchZoom(cam.current, dist / pinchDist);
        }
        pinchDist = dist;
        cam.current = panDelta(cam.current, dx / 2, dy / 2);
      } else if (mode === 'pan') {
        cam.current = panDelta(cam.current, dx, dy);
      } else {
        cam.current = orbitDelta(cam.current, dx, dy);
      }
      schedule();
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinchDist = 0;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.current = zoomDelta(cam.current, e.deltaY);
      schedule();
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    vp.addEventListener('pointerdown', onDown);
    vp.addEventListener('pointermove', onMove);
    vp.addEventListener('pointerup', onUp);
    vp.addEventListener('pointercancel', onUp);
    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('contextmenu', onContextMenu);
    return () => {
      vp.removeEventListener('pointerdown', onDown);
      vp.removeEventListener('pointermove', onMove);
      vp.removeEventListener('pointerup', onUp);
      vp.removeEventListener('pointercancel', onUp);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('contextmenu', onContextMenu);
      if (rafId.current) { window.cancelAnimationFrame(rafId.current); }
    };
  }, [apply, schedule]);

  return { viewportRef, worldRef, reset, suppressClickRef };
}
