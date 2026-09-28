import { useEffect, useRef, type ChangeEvent } from 'react';

export default function Checkbox({
  checked,
  indeterminate = false,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !checked && indeterminate;
  }, [checked, indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      className="h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      onClick={(event) => event.stopPropagation()}
    />
  );
}
