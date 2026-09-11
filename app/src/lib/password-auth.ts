export type LoginIdentifier =
  { email: string } | { phone: string } | { username: string };

export function parseLoginIdentifier(value: string): LoginIdentifier {
  const input = value.trim();
  if (input.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input))
      throw new Error('Enter a valid email address.');
    return { email: input.toLowerCase() };
  }
  if (/^[+\d]/.test(input)) {
    const phone = input.replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(phone))
      throw new Error('Include your country code, for example +91 9876543210.');
    return { phone };
  }
  const username = input.toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,29}$/.test(username))
    throw new Error(
      'Use a username of 3–30 letters, numbers or underscores, starting with a letter.',
    );
  return { username };
}

export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 10)
    throw new Error('Use at least 10 characters for your password.');
  if (password.length > 128)
    throw new Error('Use a password of 128 characters or fewer.');
  if (password !== confirmation) throw new Error('Your passwords don’t match.');
}

export function passwordError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'invalid_credentials')
    return 'The login details don’t match. Check them and try again.';
  if (code === 'email_not_confirmed')
    return 'Verify your email before signing in. Check your inbox for the confirmation message.';
  if (code === 'phone_not_confirmed')
    return 'Verify your phone number before signing in.';
  if (code?.includes('rate_limit') || code === 'over_request_rate_limit')
    return 'Too many attempts. Please wait a few minutes and try again.';
  if (code === 'sms_send_failed')
    return 'We couldn’t send a verification text. Try again later or use email.';
  return error instanceof Error
    ? error.message
    : 'We couldn’t complete that request. Please try again.';
}
