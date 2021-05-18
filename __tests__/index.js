const execa = require('execa');
const packageJson = require('../package.json');
const path = require('path');

const binPath = path.resolve(__dirname, '..', packageJson.bin['query-pattern-age']);
const astArgs = ['--astSelector', 'CallExpression[callee.object.name=console][callee.property.name=log]'];
const baseArgs = [
  '--paths', path.join('..', '__fixtures__'), 
  ...astArgs
];

/**
 * @param {string[]} args 
 * @param {import("execa").Options} opts
 * @returns 
 */
// Setting "opts = {}" was the only way I could figure out to make opts optional.
const execTest = (args, opts = {}) => execa(binPath, args, {
  cwd: __dirname,
  ...opts
});

describe('query-pattern-age', () => {
  it('raw', async () => {
    const {stdout} = await execTest([...baseArgs, '--format', 'raw']);
    expect(JSON.parse(stdout)).toMatchSnapshot();
  });
  it('pretty', async () => {
    const {stdout} = await execTest([...baseArgs, '--format', 'pretty'], {
      env: {
        // https://github.com/marak/colors.js#enablingdisabling-colors
        FORCE_COLOR: '1'
      }
    });
    expect(stdout).toMatchSnapshot();
  });
  it('only one file', async () => {
    const {stdout} = await execTest([
      ...astArgs, 
      '--format', 'raw', 
      '--paths', path.join('..', '__fixtures__', 'also-contains-pattern.js')
    ]);
    expect(JSON.parse(stdout)).toMatchSnapshot();
  });
});