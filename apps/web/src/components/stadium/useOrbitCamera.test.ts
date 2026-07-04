import React from 'react';
import { render, act } from '@testing-library/react';
import {
  CAM_DEFAULTS,
  TILT_MIN,
  TILT_MAX,
  ZOOM_MIN,
  ZOOM_MAX,
  orbitDelta,
  panDelta,
  zoomDelta,
  pinchZoom,
  camTransform,
  useOrbitCamera,
} from './useOrbitCamera';

describe('camera math:', () => {
  test('orbitDelta rotates with dx and tilts with dy', () => {
    const c = orbitDelta(CAM_DEFAULTS, 10, -10);
    expect(c.orbit).toBeCloseTo(CAM_DEFAULTS.orbit + 4);
    expect(c.tilt).toBeCloseTo(CAM_DEFAULTS.tilt + 3);
  });

  test('tilt clamps to its bounds', () => {
    expect(orbitDelta(CAM_DEFAULTS, 0, 10_000).tilt).toBe(TILT_MIN);
    expect(orbitDelta(CAM_DEFAULTS, 0, -10_000).tilt).toBe(TILT_MAX);
  });

  test('panDelta translates without touching orbit or zoom', () => {
    const c = panDelta(CAM_DEFAULTS, 12, -7);
    expect(c.panX).toBe(12);
    expect(c.panY).toBe(-7);
    expect(c.orbit).toBe(CAM_DEFAULTS.orbit);
    expect(c.zoom).toBe(CAM_DEFAULTS.zoom);
  });

  test('zoomDelta is exponential and clamped', () => {
    expect(zoomDelta(CAM_DEFAULTS, -100).zoom).toBeCloseTo(CAM_DEFAULTS.zoom * Math.exp(0.1));
    expect(zoomDelta(CAM_DEFAULTS, -100_000).zoom).toBe(ZOOM_MAX);
    expect(zoomDelta(CAM_DEFAULTS, 100_000).zoom).toBe(ZOOM_MIN);
  });

  test('pinchZoom multiplies by the distance ratio, clamped', () => {
    expect(pinchZoom(CAM_DEFAULTS, 1.5).zoom).toBeCloseTo(CAM_DEFAULTS.zoom * 1.5);
    expect(pinchZoom(CAM_DEFAULTS, 100).zoom).toBe(ZOOM_MAX);
  });

  test('camTransform emits pan, scale, tilt and orbit in outer-to-inner order', () => {
    const t = camTransform({ tilt: 40, orbit: -15, zoom: 1.2, panX: 5, panY: -3 });
    expect(t).toBe('translate(5px, -3px) scale(1.2) rotateX(40deg) rotateZ(-15deg)');
  });
});

describe('useOrbitCamera:', () => {
  // Render a real component so the refs are attached before the hook's effect
  // runs (jsdom lacks setPointerCapture; the hook guards with ?.()).
  function setup() {
    const captured = { current: null as null | ReturnType<typeof useOrbitCamera> };
    function Harness() {
      const cam = useOrbitCamera();
      captured.current = cam;
      return React.createElement(
        'div',
        { ref: cam.viewportRef, 'data-testid': 'vp' },
        React.createElement('div', { ref: cam.worldRef, 'data-testid': 'world' }),
      );
    }
    const { getByTestId } = render(React.createElement(Harness));
    const hook = {
      result: {
        get current() {
          if (!captured.current) { throw new Error('hook did not render'); }
          return captured.current;
        },
      },
    };
    return { hook, vp: getByTestId('vp'), world: getByTestId('world') };
  }

  function pointer(type: string, opts: { x: number, y: number, id?: number, button?: number, shiftKey?: boolean }) {
    const e = new MouseEvent(type, {
      clientX: opts.x,
      clientY: opts.y,
      button: opts.button ?? 0,
      shiftKey: opts.shiftKey ?? false,
      bubbles: true,
    });
    Object.defineProperty(e, 'pointerId', { value: opts.id ?? 1 });
    return e;
  }

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  test('applies the default transform to the world element on mount', () => {
    const { world } = setup();
    expect(world.style.transform).toBe(camTransform(CAM_DEFAULTS));
  });

  test('left-drag orbits and sets the click-suppression flag past the threshold', () => {
    const { hook, vp, world } = setup();
    act(() => {
      vp.dispatchEvent(pointer('pointerdown', { x: 100, y: 100 }));
      vp.dispatchEvent(pointer('pointermove', { x: 120, y: 90 }));
      vp.dispatchEvent(pointer('pointerup', { x: 120, y: 90 }));
    });
    expect(world.style.transform).toBe(camTransform(orbitDelta(CAM_DEFAULTS, 20, -10)));
    expect(hook.result.current.suppressClickRef.current).toBe(true);
  });

  test('a tiny movement does not suppress the click (selection still works)', () => {
    const { hook, vp } = setup();
    act(() => {
      vp.dispatchEvent(pointer('pointerdown', { x: 100, y: 100 }));
      vp.dispatchEvent(pointer('pointermove', { x: 101, y: 101 }));
      vp.dispatchEvent(pointer('pointerup', { x: 101, y: 101 }));
    });
    expect(hook.result.current.suppressClickRef.current).toBe(false);
  });

  test('shift-drag pans instead of orbiting', () => {
    const { vp, world } = setup();
    act(() => {
      vp.dispatchEvent(pointer('pointerdown', { x: 0, y: 0, shiftKey: true }));
      vp.dispatchEvent(pointer('pointermove', { x: 30, y: 10, shiftKey: true }));
    });
    expect(world.style.transform).toBe(camTransform(panDelta(CAM_DEFAULTS, 30, 10)));
  });

  test('wheel zooms and prevents default scrolling', () => {
    const { vp, world } = setup();
    const e = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    act(() => { vp.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
    expect(world.style.transform).toBe(camTransform(zoomDelta(CAM_DEFAULTS, -100)));
  });

  test('reset restores defaults with a transition', () => {
    const { hook, vp, world } = setup();
    act(() => {
      vp.dispatchEvent(pointer('pointerdown', { x: 0, y: 0 }));
      vp.dispatchEvent(pointer('pointermove', { x: 50, y: 50 }));
      hook.result.current.reset();
    });
    expect(world.style.transform).toBe(camTransform(CAM_DEFAULTS));
    expect(world.style.transition).toContain('transform');
  });
});
