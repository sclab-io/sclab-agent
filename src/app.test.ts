import MybatisMapper from 'mybatis-mapper';
import { App } from './app';

describe('App', () => {
  test('registerAPI creates mapper with correct namespace and SQL', () => {
    // mock createMapper
    (MybatisMapper.createMapper as jest.Mock) = jest.fn();
    const api = { path: 'somePath', name: 'someName', SQL: 'SELECT 1', injectionCheck: false, desc: '' };
    App.registerAPI(api, 'api');
    expect(MybatisMapper.createMapper).toHaveBeenCalled();
    const mapperArg = (MybatisMapper.createMapper as jest.Mock).mock.calls[0][0][0] as string;
    expect(mapperArg).toContain('namespace="api"');
    expect(mapperArg).toContain(api.SQL);
    expect(mapperArg).toContain(api.path);
  });
});