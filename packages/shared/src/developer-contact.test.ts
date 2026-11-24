import { describe, expect, it } from 'vitest';
import { DEFAULT_DEVELOPER_CONTACT, developerContactSchema } from './contracts';

describe('developer contact validation', () => {
  it('accepts the configured developer and blank optional fields', () => {
    expect(developerContactSchema.parse(DEFAULT_DEVELOPER_CONTACT)).toEqual(
      DEFAULT_DEVELOPER_CONTACT,
    );
    expect(
      developerContactSchema.safeParse({
        name: '',
        email: '',
        mobile: '',
        facebookUrl: '',
        websiteUrl: '',
        supportHours: '',
      }).success,
    ).toBe(true);
  });
  it('trims values and accepts international mobile numbers and HTTPS links', () => {
    const parsed = developerContactSchema.parse({
      ...DEFAULT_DEVELOPER_CONTACT,
      name: ' Dinuka Dilshan ',
      mobile: '+94 70 523 7919',
      facebookUrl: 'https://www.facebook.com/test-developer',
      websiteUrl: 'https://example.com',
    });
    expect(parsed.name).toBe('Dinuka Dilshan');
    expect(parsed.mobile).toBe('+94 70 523 7919');
  });
  it('rejects unsafe links, non-Facebook profiles and invalid contact information', () => {
    for (const change of [
      { email: 'invalid-email' },
      { mobile: 'call-me-now' },
      { mobile: '123' },
      { facebookUrl: 'https://facebook.com.evil.example/profile' },
      { websiteUrl: 'javascript:alert(1)' },
      { websiteUrl: 'https://user:password@example.com' },
      { websiteUrl: 'http://example.com' },
      { supportHours: 'x'.repeat(161) },
    ])
      expect(
        developerContactSchema.safeParse({ ...DEFAULT_DEVELOPER_CONTACT, ...change }).success,
      ).toBe(false);
  });
});
