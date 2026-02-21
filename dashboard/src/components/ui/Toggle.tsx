'use client';

export function Toggle({
  enabled,
  onChange,
  label,
  description,
  disabled,
}: {
  enabled: boolean;
  onChange: (val: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-4 cursor-pointer group">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        data-state={enabled ? 'on' : 'off'}
        className="toggle-track shrink-0 mt-0.5 disabled:opacity-40"
      >
        <div
          className="toggle-thumb"
          style={{ transform: enabled ? 'translateX(18px)' : 'translateX(0)' }}
        />
      </button>
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && (
            <span className="block text-[14px] font-medium text-white/80 group-hover:text-white transition-colors">
              {label}
            </span>
          )}
          {description && (
            <span className="block text-[13px] text-white/40 mt-0.5 leading-relaxed">
              {description}
            </span>
          )}
        </div>
      )}
    </label>
  );
}
