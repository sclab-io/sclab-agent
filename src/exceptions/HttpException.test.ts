import { HttpException } from './HttpException';

describe('HttpException', () => {
  test('sets status and message', () => {
    const e = new HttpException(400, 'Bad request');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(HttpException);
    expect(e.status).toBe(400);
    expect(e.message).toBe('Bad request');
  });
});
