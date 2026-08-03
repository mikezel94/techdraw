import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

const POPOVER_WIDTH = 340;
const SPOTLIGHT_PADDING = 8;
const VIEWPORT_MARGIN = 12;
// Rough height used to decide whether the popover fits below the spotlight.
const POPOVER_HEIGHT_ESTIMATE = 230;

interface OnboardingStep {
  selector: string;
  title: string;
  body: string;
}

const STEPS: OnboardingStep[] = [
  {
    selector: '.toolbar',
    title: 'Pick a tool, then draw',
    body:
      'Everything starts in this toolbar: select, pencil, shapes, lines, arrows, ' +
      'dimensions and text. Tools are one-shot — after you draw something you are ' +
      'back on Select with the new shape selected. Undo, redo and file actions live here too.',
  },
  {
    selector: '[data-testid="tool-dimension"]',
    title: 'Dimensions that follow shapes',
    body:
      'The dimension tool adds engineering-style measurements. Drag between two points; ' +
      'an endpoint that lands on a shape binds to it, so the measurement follows the ' +
      'shape when it moves.',
  },
  {
    selector: '.zoom-controls',
    title: 'Zoom and pan',
    body:
      'Zoom with these buttons, the mouse wheel, or + / − / 0. Pan by holding Space ' +
      '(or the middle mouse button) and dragging. The canvas is infinite.',
  },
  {
    selector: '.grid-controls',
    title: 'Grid, snap — and a head start',
    body:
      'Toggle the background grid and snap-to-grid here. Want to see it all in action? ' +
      'Load the example drawing — labeled shapes, bound arrows, a live dimension and a ' +
      'freehand sketch — or start from a blank canvas.',
  },
];

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface OnboardingOverlayProps {
  /** Called with true when the user picks "Load Example Drawing". */
  onFinish: (loadExample: boolean) => void;
}

export default function OnboardingOverlay({ onFinish }: OnboardingOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [target, setTarget] = useState<TargetRect | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  const measure = useCallback(() => {
    const el = document.querySelector(STEPS[stepIndex].selector);
    if (!el) {
      setTarget(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setTarget({
      top: rect.top - SPOTLIGHT_PADDING,
      left: rect.left - SPOTLIGHT_PADDING,
      width: rect.width + SPOTLIGHT_PADDING * 2,
      height: rect.height + SPOTLIGHT_PADDING * 2,
    });
  }, [stepIndex]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [stepIndex]);

  // Register once and read onFinish through a ref, so a mid-dispatch
  // re-render cannot detach the listener while Escape is still propagating.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onFinishRef.current(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  let popoverStyle: CSSProperties;
  if (target) {
    const fitsBelow =
      target.top + target.height + VIEWPORT_MARGIN + POPOVER_HEIGHT_ESTIMATE <=
      window.innerHeight;
    const top = fitsBelow
      ? target.top + target.height + VIEWPORT_MARGIN
      : Math.max(VIEWPORT_MARGIN, target.top - POPOVER_HEIGHT_ESTIMATE - VIEWPORT_MARGIN);
    const centerX = target.left + target.width / 2;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, centerX - POPOVER_WIDTH / 2),
      window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN,
    );
    popoverStyle = { top, left, width: POPOVER_WIDTH };
  } else {
    popoverStyle = {
      top: '50%',
      left: '50%',
      width: POPOVER_WIDTH,
      transform: 'translate(-50%, -50%)',
    };
  }

  return (
    <div className="onboarding" data-testid="onboarding-overlay">
      {target && (
        <div
          className="onboarding-spotlight"
          data-testid="onboarding-spotlight"
          style={{
            top: target.top,
            left: target.left,
            width: target.width,
            height: target.height,
          }}
        />
      )}
      <div className="onboarding-popover" style={popoverStyle} data-testid="onboarding-popover">
        <div className="onboarding-header">
          <span className="onboarding-step-count" data-testid="onboarding-step-count">
            Step {stepIndex + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            className="onboarding-skip"
            data-testid="onboarding-skip"
            onClick={() => onFinish(false)}
          >
            Skip tour
          </button>
        </div>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="onboarding-footer">
          {stepIndex > 0 && (
            <button
              type="button"
              data-testid="onboarding-back"
              onClick={() => setStepIndex((i) => i - 1)}
            >
              Back
            </button>
          )}
          {!isLastStep && (
            <button
              ref={primaryRef}
              type="button"
              className="primary"
              data-testid="onboarding-next"
              onClick={() => setStepIndex((i) => i + 1)}
            >
              Next
            </button>
          )}
          {isLastStep && (
            <>
              <button
                ref={primaryRef}
                type="button"
                className="primary"
                data-testid="onboarding-load-example"
                onClick={() => onFinish(true)}
              >
                Load Example Drawing
              </button>
              <button type="button" data-testid="onboarding-start" onClick={() => onFinish(false)}>
                Start drawing
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
