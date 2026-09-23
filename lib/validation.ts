const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_NAME_LENGTH = 50;

export function getRequiredError(value: string, fieldLabel: string): string | null {
  return value.trim() ? null : `${fieldLabel}を入力してください。`;
}

export function getEmailError(email: string): string | null {
  return (
    getRequiredError(email, "メールアドレス") ??
    (EMAIL_PATTERN.test(email.trim()) ? null : "メールアドレスの形式が正しくありません。")
  );
}

export function getNewPasswordError(password: string): string | null {
  return (
    getRequiredError(password, "パスワード") ??
    (password.length >= MIN_PASSWORD_LENGTH
      ? null
      : `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。`)
  );
}

export function getNameError(name: string): string | null {
  return (
    getRequiredError(name, "名前") ??
    (Array.from(name.trim()).length <= MAX_NAME_LENGTH
      ? null
      : `名前は${MAX_NAME_LENGTH}文字以内で入力してください。`)
  );
}
