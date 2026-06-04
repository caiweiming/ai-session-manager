import { useEffect, useMemo, useRef, useState } from "react";

export type CustomSelectOption = {
  value: string;
  label: string;
};

export function CustomSelect({
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  leadingIcon,
  className = "",
}: {
  ariaLabel: string;
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  leadingIcon?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? options[0] ?? { value: "", label: "--" },
    [options, value],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`custom-select${className ? ` ${className}` : ""}${disabled ? " disabled" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`custom-select-trigger${open ? " open" : ""}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((valueNow) => !valueNow);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {leadingIcon ? <span className="custom-select-leading">{leadingIcon}</span> : null}
        <span className="custom-select-value">{selected.label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open ? (
        <ul className="custom-select-menu" role="listbox" aria-label={`${ariaLabel}-options`}>
          {options.map((option) => (
            <li key={option.value} role="option" aria-selected={option.value === selected.value}>
              <button
                type="button"
                className={`custom-select-option${option.value === selected.value ? " active" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
