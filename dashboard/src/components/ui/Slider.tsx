'use client';
import { cn } from '@/lib/utils';

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  valueLabel,
  hint,
  className,
}: {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  valueLabel?: string;
  hint?: string;
  className?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn('space-y-3', className)}>
      {(label || valueLabel) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-[14px] text-white/60">{label}</span>}
          {valueLabel && (
            <span className="text-[14px] font-medium text-white bg-white/[0.08] px-2.5 py-0.5 rounded-full">
              {valueLabel}
            </span>
          )}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 cursor-pointer"
        style={{
          background: `linear-gradient(to right, #fff 0%, #fff ${pct}%, rgba(255,255,255,0.06) ${pct}%, rgba(255,255,255,0.06) 100%)`,
        }}
      />
      {hint && <p className="text-[12px] text-white/30">{hint}</p>}
    </div>
  );
}
