import { CommonHandler } from './CommonHandler';

describe('CommonHandler', () => {
  test('handle returns error for undefined path', async () => {
    const req = { path: '/unknown' } as any;
    const res = await CommonHandler.handle(req);
    expect(res).toEqual({ status: 'error', result: 'Undefined api /unknown' });
  });
});
