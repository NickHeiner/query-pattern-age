const execa = require('execa');
const packageJson = require('../package.json');
const path = require('path');

const binPath = path.resolve(__dirname, '..', packageJson.bin['query-pattern-age']);
const astArgs = ['--astSelector', 'CallExpression[callee.object.name=console][callee.property.name=log]'];
const baseArgs = [
  '--paths', path.resolve(__dirname, '..', '__fixtures__'), 
  ...astArgs
];

describe('query-pattern-age', () => {
  it('raw', async () => {
    const {stdout} = await execa(binPath, [...baseArgs, '--format', 'raw']);
    expect(JSON.parse(stdout)).toMatchSnapshot();
  });
  it('pretty', async () => {
    const {stdout} = await execa(binPath, [...baseArgs, '--format', 'pretty']);
    expect(stdout).toMatchSnapshot();
  });
  it('only one file', async () => {
    const {stdout} = await execa(binPath, [
      ...astArgs, 
      '--format', 'raw', 
      '--paths', path.resolve(__dirname, '..', '__fixtures__', 'also-contains-pattern.js')
    ]);
    expect(JSON.parse(stdout)).toMatchSnapshot();
  });
});