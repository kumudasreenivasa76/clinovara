// Password rules, shown as a live checklist. The server enforces the same list (backend/src/domain/auth.js).
export const PASSWORD_RULES = [
  ['At least 8 characters', (p) => p.length >= 8],
  ['An uppercase letter (A to Z)', (p) => /[A-Z]/.test(p)],
  ['A lowercase letter (a to z)', (p) => /[a-z]/.test(p)],
  ['A number (0 to 9)', (p) => /\d/.test(p)],
  ['A special character (! @ # $ %)', (p) => /[^A-Za-z0-9\s]/.test(p)],
];
export const passwordOk = (p) => PASSWORD_RULES.every(([, ok]) => ok(String(p || '')));
