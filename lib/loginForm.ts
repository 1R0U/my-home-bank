export function canSubmitLogin(email: string, password: string): boolean {
  return email.trim().length > 0 && password.trim().length > 0;
}
