// Live input masking for the enrollment form — reformats what's in the field as the
// patient types, not just how an already-stored value is displayed (that's
// src/lib/format.ts's job). Both re-derive the formatted string from digits-only on
// every keystroke rather than tracking cursor position/edits, which is simple and
// robust for typing and pasting; backspacing through a "-" or ")" character can feel a
// touch imprecise, a tradeoff worth it to avoid a full input-mask library for two fields.

// "123-45-6789" — matches the SSN format the backend actually validates
// (see SSN_PATTERN in src/app/api/intakes/route.ts) and the field's own hint text.
export function formatSsnInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  const parts = [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 9)].filter(Boolean);
  return parts.length <= 1 ? (parts[0] ?? "") : parts.join("-");
}

// "(123) 456-7890" — matches the field's own placeholder.
export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
