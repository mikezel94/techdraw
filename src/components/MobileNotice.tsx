interface MobileNoticeProps {
  onDismiss: () => void;
}

export default function MobileNotice({ onDismiss }: MobileNoticeProps) {
  return (
    <div className="mobile-notice-backdrop" data-testid="mobile-notice">
      <div className="mobile-notice" role="dialog" aria-label="TechDraw works best on desktop">
        <h2>TechDraw works best on desktop</h2>
        <p>For the full experience, please use a computer with a mouse/trackpad.</p>
        <button
          type="button"
          className="primary"
          data-testid="mobile-notice-try-anyway"
          onClick={onDismiss}
        >
          Try anyway
        </button>
      </div>
    </div>
  );
}
