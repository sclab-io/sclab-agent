import { stream } from './logger';

describe('logger stream', () => {
  test('write logs without trailing newline', () => {
    const spy = jest.spyOn(console, 'info').mockImplementation();
    stream.write('message\n');
    expect(spy).toHaveBeenCalledWith('message');
    spy.mockRestore();
  });
});
