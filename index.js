const resolveFrom = require('resolve-from');
const dedent = require('dedent');
const {promisify} = require('util');
const _ = require('lodash');
const globby = require('globby');
const readFile = promisify(require('fs').readFile.bind(require('fs')));
const execa = require('execa');

/**
 * @param {object} options 
 * @param {string} options.astSelector
 * @param {string[]} options.paths
 */
async function queryPatternAge(options) {
  const files = _.flatten(await Promise.all(options.paths.map(path => globby(path))));
  const eslintMainPath = getEslintPath();
  
  /** @type {import("eslint")} */
  const {CLIEngine, Linter} = require(eslintMainPath);
  const cliEngine = new CLIEngine({});
  const linter = new Linter();

  const eslintReport = await getEslintReports(cliEngine, linter, files, options.astSelector);
  const locations = getLocations(eslintReport);
  return getGitTimestamps(locations);
}

/**
 * @param {ReturnType<typeof getLocations>} locations 
 */
async function getGitTimestamps(locations) {
  const timestamps = await Promise.all(
    _.map(locations, (locationsForFile, filePath) => Promise.all(_.map(locationsForFile, async ({line, endLine}) => {
      const {stdout: gitResults} = await execa('git', ['blame', filePath, '-L', `${line},${endLine}`, '--porcelain']);
      // TODO: To improve accuracy of results, emit a count of how often each commit appears in the blame, instead of
      // assuming that all commits occur equally often.
      return gitResults
        .split('\n')
        .filter(line => line.startsWith('author-time'))
        .map(line => line.split(' ')[1]);
    })))
  );
  return _(timestamps).flattenDeep().countBy().value();
}

/**
 * @param {{[filePath: string]: import("eslint").Linter.LintMessage[]}} eslintReport 
 */
function getLocations(eslintReport) {
  return _.mapValues(
    eslintReport, 
    messages => _(messages)
      // If the eslint config uses special preprocessors to handle files like .md files, then when we lint here,
      // we'll get a parse error. In this case, ruleId will be null.
      .filter('ruleId')
      .map(message => _.pick(message, ['line', 'endLine']))
      .value()
  );
}

function getEslintPath() {
  try {
    return resolveFrom(process.cwd(), 'eslint');
  } catch (e) {
    const err = new Error(dedent`
      eslint-bankruptcy could not find an eslint instance to run. To resolve this:

      1. Run this command from a directory in which "require('eslint')" works.
      2. Pass an eslint instance to use.
      3. Pass a directory from which to resolve eslint.
    `);
    // @ts-ignore I'm fine assigning to err.originalError even though it doesn't exist on the Error type.
    err.originalError = e;
    throw err;
  }
}

/**
 * 
 * @param {import("eslint").CLIEngine} cliEngine 
 * @param {import("eslint").Linter} linter 
 * @param {string[]} files 
 * @param {string} astSelector 
 * @return {Promise<{[filePath: string]: import("eslint").Linter.LintMessage[]}>}
 */
async function getEslintReports(cliEngine, linter, files, astSelector) {
  const pairs = await Promise.all(_(files)
    .reject(filePath => cliEngine.isPathIgnored(filePath))
    .map(async filePath => {
      const config = cliEngine.getConfigForFile(filePath);
      config.rules = {
        'no-restricted-syntax': [2, astSelector]
      };
      const fileContents = await readFile(filePath, 'utf8');
      return [filePath, linter.verify(fileContents, config)];
    })
    .value()
  );
  return _.fromPairs(pairs);
}

module.exports = queryPatternAge;