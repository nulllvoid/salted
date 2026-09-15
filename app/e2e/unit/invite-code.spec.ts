import { test, expect } from '@playwright/test';
import {
  normalizeInviteCode,
  isValidInviteCode,
} from '../../src/lib/invite-code';

test('pasted invite codes accept spaces, newlines, and uppercase', () => {
  expect(normalizeInviteCode(' A1B2 C3D4\nE5F6 ')).toBe('a1b2c3d4e5f6');
  expect(isValidInviteCode(' A1B2 C3D4\nE5F6 ')).toBe(true);
});
test('incomplete, extra, and non-hex characters are not submitted', () => {
  for (const code of ['', 'a1b2', 'a1b2c3d4e5f6a', 'z1b2c3d4e5f6'])
    expect(isValidInviteCode(code)).toBe(false);
});
