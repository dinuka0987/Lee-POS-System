import { describe, expect, it } from 'vitest';
import { adminSetupSchema } from './contracts';
const valid = {
  name: ' Shop Owner ',
  email: ' Owner@Example.com ',
  password: 'new-owner-password-123',
  setupKey: 'a'.repeat(48),
};
describe('initial admin setup', () => {
  it('normalizes the chosen name and email', () => {
    expect(adminSetupSchema.parse(valid)).toMatchObject({
      name: 'Shop Owner',
      email: 'owner@example.com',
    });
  });
  it('rejects weak passwords, multibyte bcrypt overflow, missing keys and injected roles', () => {
    for (const body of [
      { ...valid, password: 'short' },
      { ...valid, password: '界'.repeat(25) },
      { ...valid, setupKey: '' },
      { ...valid, name: '  ' },
      { ...valid, email: 'invalid' },
      { ...valid, role: 'admin' },
    ])
      expect(adminSetupSchema.safeParse(body).success).toBe(false);
  });
});
