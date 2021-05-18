const execa = require('execa');
const packageJson = require('../package.json');
const path = require('path');
const _ = require('lodash');

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
    const {stdout} = await execa(binPath, [...baseArgs, '--format', 'pretty'], {
      // If CI=true, the output will have no color. We want to assert that the output does have color.
      env: _.omit(process.env, 'CI'),
      extendEnv: false
    });
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