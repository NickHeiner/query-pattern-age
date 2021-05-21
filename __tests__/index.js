const execa = require('execa');
const packageJson = require('../package.json');
const path = require('path');

const binPath = path.resolve(__dirname, '..', packageJson.bin['query-pattern-age']);
const astArgs = ['--astSelector', 'CallExpression[callee.object.name=console][callee.property.name=log]'];
const baseArgs = [
  '--paths', '__fixtures__', 
  ...astArgs
];

/**
 * @param {string[]} args 
 * @param {import("execa").Options} opts
 * @returns 
 */
// Setting "opts = {}" was the only way I could figure out to make opts optional.
const execTest = (args, opts = {}) => execa(binPath, args, {
  cwd: path.join(__dirname, '..'),
  ...opts
});

describe('query-pattern-age', () => {
  test.each([
    ['raw', {}, [...baseArgs, '--format', 'raw']],
    ['raw survey', {}, [...baseArgs, '--format', 'raw', '--survey']],
    ['default survey', {stdoutIsJson: false}, [...baseArgs, '--survey']],
    ['pretty', {stdoutIsJson: false}, [...baseArgs, '--format', 'pretty'], {
      env: {
        // https://github.com/marak/colors.js#enablingdisabling-colors
        FORCE_COLOR: '1'
      }
    }],
    [
      'only one file',
      {},
      [
        ...astArgs, 
        '--format', 'raw', 
        '--paths', path.join('__fixtures__', 'also-contains-pattern.js')
      ]
    ]
  ])('%s', async (_, rawOpts, /** @type Parameters<typeof execTest> */...execArgs ) => {
    const opts = {
      stdoutIsJson: true,
      ...rawOpts
    };
    const {stdout} = await execTest(...execArgs);
    expect(opts.stdoutIsJson ? JSON.parse(stdout) : stdout).toMatchSnapshot();
  });
});