interface MobileNoticeProps {
  onDismiss: () => void;
}

export default function MobileNotice({ onDismiss }: MobileNoticeProps) {
  return (
    <div className="mobile-notice-backdrop" data-testid="mobile-notice" role="dialog" aria-modal="true">
      <div className="mobile-notice">
        <h2>TechDraw works best on desktop</h2>
        <p>For the full experience, please use a computer with a mouse/trackpad.</p>
        <button
          type="button"
          className="mobile-notice-action"
          data-testid="mobile-notice-try-anyway"
          onClick={onDismiss}
        >
          Try anyway
        </button>
      </div>
    </div>
  );
}
