import { validateEnvironment } from './environment';
const valid = {
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  JWT_SECRET: 'test-only-configuration-secret-32-characters',
  BRANCH_ID: '00000000-0000-4000-8000-000000000001',
};

describe('environment configuration', () => {
  it('provides local defaults and converts the port to a number', () => {
    expect(validateEnvironment({ ...valid, API_PORT: '3100' })).toMatchObject({
      API_PORT: 3100,
      WEB_ORIGIN: 'http://localhost:5173',
    });
  });

  it('fails early on invalid ports and insecure production origins', () => {
    expect(() => validateEnvironment({ API_PORT: 'invalid' })).toThrow();
    expect(() => validateEnvironment({ ...valid, NODE_ENV: 'production' })).toThrow(
      'WEB_ORIGIN must use HTTPS in production',
    );
  });
});
