const execa = require('execa');
const packageJson = require('../package.json');
const path = require('path');

const log = require('../src/log');

const queryPatternAgeBinPath = path.resolve(__dirname, '..', packageJson.bin['query-pattern-age']);
const queryFileEditCountBinPath = path.resolve(__dirname, '..', packageJson.bin['query-file-edit-count']);
const astArgs = ['--astSelector', 'CallExpression[callee.object.name=console][callee.property.name=log]'];

const pathToFixturesArgs = ['--paths', '__fixtures__'];
const baseArgs = [
  ...pathToFixturesArgs,
  ...astArgs
];

/**
 * @param {string} binPath
 * @param {string[]} args 
 * @param {import("execa").Options} opts
 * @returns 
 */
// Setting "opts = {}" was the only way I could figure out to make opts optional.
const execTest = (binPath, args, opts = {}) => {
  log.debug('Invoking', {args});
  return execa(binPath, args, {
    cwd: path.join(__dirname, '..'),
    ...opts
  });
};

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
  // I think TS is mistaken that this is unsafe.
  // @ts-expect-error
  ])('%s', async (_, rawOpts, /** @type Parameters<typeof execTest> */...execArgs) => {
    const opts = {
      stdoutIsJson: true,
      ...rawOpts
    };
    const fullExecArgs = [queryPatternAgeBinPath, ...execArgs];
    // I think TS is mistaken that this is unsafe.
    // @ts-expect-error
    const {stdout} = await execTest(...fullExecArgs);
    expect(opts.stdoutIsJson ? JSON.parse(stdout) : stdout).toMatchSnapshot();
  });

  describe('conflicting args', () => {
    test.each([
      [
        ['--survey', '--hash-url-format', 'http://foo/%s'], 
        '--survey is not compatible with --hash-url-format or --after, since they only apply to the git blame mode.'
      ],
      [
        ['--survey', '--after', '2021-01-01'], 
        '--survey is not compatible with --hash-url-format or --after, since they only apply to the git blame mode.'
      ]
    ])('flags are invalid: %p', async (flags, message) => {
      try {
        await execTest(queryPatternAgeBinPath, [...baseArgs, ...flags]);
        // ESLint is wrong. This global is available.
        // eslint-disable-next-line no-undef
        fail('The command should have failed');
      } catch (err) {
        expect(err.exitCode).toBe(1);
        expect(err.stderr).toContain(message);
      }
    });

  });
});

describe('query-file-edit-count', () => {
  test.each([
    ['default', pathToFixturesArgs]
    // ['--after', '']
  ])('%s', async (_, flags) => {
    const {stdout} = await execTest(queryFileEditCountBinPath, flags);
    expect(stdout).toMatchSnapshot();
  });
});