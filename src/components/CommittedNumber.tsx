import { useEffect, useState } from "react";
export function CommittedNumber({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value)),
    [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(String(value));
    setInvalid(false);
  }, [value]);
  const commit = () => {
    const number = Number(draft.replace(",", "."));
    if (
      !draft.trim() ||
      !Number.isFinite(number) ||
      number < min ||
      number > max
    ) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (number !== value) onCommit(number);
  };
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="text"
        inputMode="decimal"
        value={draft}
        aria-invalid={invalid}
        onChange={(e) => {
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
          }
          if (e.key === "Escape") {
            setDraft(String(value));
            setInvalid(false);
          }
        }}
      />
      {invalid && (
        <small role="alert">
          Entre {min} et {max}.
        </small>
      )}
    </label>
  );
}
