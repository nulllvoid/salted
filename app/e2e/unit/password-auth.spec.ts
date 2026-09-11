import { expect, test } from '@playwright/test';
import {
  parseLoginIdentifier,
  validateNewPassword,
} from '../../src/lib/password-auth';

test('normalizes login identities without guessing a country code', () => {
  expect(parseLoginIdentifier('  Person@Example.com ')).toEqual({
    email: 'person@example.com',
  });
  expect(parseLoginIdentifier('+91 (98765) 43210')).toEqual({
    phone: '+919876543210',
  });
  expect(parseLoginIdentifier('  Shiv_A ')).toEqual({ username: 'shiv_a' });
  for (const input of ['9876543210', 'a@b', '', 'a', 'bad-name', '+0123456789'])
    expect(() => parseLoginIdentifier(input)).toThrow();
});
test('new passwords must match and satisfy length without trimming', () => {
  expect(() => validateNewPassword('short', 'short')).toThrow();
  expect(() => validateNewPassword('a-long-password', 'different')).toThrow();
  expect(() => validateNewPassword('a'.repeat(129), 'a'.repeat(129))).toThrow();
  expect(() =>
    validateNewPassword('a-long-password ', 'a-long-password '),
  ).not.toThrow();
});
