const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

export function getRequiredError(value: string, fieldLabel: string): string | null {
  return value.trim().length > 0 ? null : `${fieldLabel}を入力してください。`;
}

export function getEmailFormatError(email: string): string | null {
  return EMAIL_REGEX.test(email.trim()) ? null : "メールアドレスの形式が正しくありません。";
}

export function getEmailError(email: string): string | null {
  return getRequiredError(email, "メールアドレス") ?? getEmailFormatError(email);
}

export function getPasswordStrengthError(password: string): string | null {
  return password.length >= MIN_PASSWORD_LENGTH
    ? null
    : `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。`;
}

/** 新規登録時のパスワード用。未入力チェックに加えて強度もチェックする。 */
export function getNewPasswordError(password: string): string | null {
  return getRequiredError(password, "パスワード") ?? getPasswordStrengthError(password);
}

export function getNameError(name: string): string | null {
  return getRequiredError(name, "名前");
}
