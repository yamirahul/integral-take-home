// PII masking for a Reviewer's default "redacted" view — see the README's Privacy Model
// and src/lib/intakes.ts's getIntakeDetail(). Never applied to a Patient's own data, and
// never applied to a Reviewer's explicit "privileged" request.

function lastDigits(value: string, count: number): string {
  return value.replace(/\D/g, "").slice(-count);
}

// "***-**-6789" — matches the exact example in the README's Privacy Model section.
export function redactSsn(ssn: string): string {
  const last4 = lastDigits(ssn, 4).padStart(4, "*");
  return `***-**-${last4}`;
}

// "***-***-1234" — matches the exact example in the README's Privacy Model section.
export function redactPhone(phone: string): string {
  const last4 = lastDigits(phone, 4).padStart(4, "*");
  return `***-***-${last4}`;
}

// The README gives no example for DOB specifically. Following the same "reveal the least
// sensitive slice" idea as SSN/phone: keep only the birth year, which is useful context
// for initial screening (trial age eligibility) without exposing the exact date.
export function redactDateOfBirth(dateOfBirth: string): string {
  const year = new Date(dateOfBirth).getFullYear();
  return Number.isNaN(year) ? "**/**/****" : `**/**/${year}`;
}
