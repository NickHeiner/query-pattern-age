const resolveFrom = require('resolve-from');
const dedent = require('dedent');
const {promisify} = require('util');
const log = require('nth-log');
const _ = require('lodash');
const globby = require('globby');
const readFile = promisify(require('fs').readFile.bind(require('fs')));

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

  log.trace(eslintReport);
}

/**
 * @param {Array<{filePath: string, messages: Array<{ruleId: string, line: number}>}>} eslintReport 
 * @param {string[]} rules
 * @return {{[filePath: string]: {[lineNumber: number]: string[]}}}}
 */
function getViolations(eslintReport, rules) {
  return _(eslintReport)
    .flatMapDeep(({filePath, messages}) => _.flatMap(messages, ({ruleId, line}) => ({filePath, ruleId, line})))
    .groupBy('filePath')
    .mapValues(entry => _(entry)
      .filter(({ruleId}) => rules.includes(ruleId))
      .groupBy('line')
      .mapValues(violations => _.map(violations, 'ruleId'))
      .value()
    )
    .toPairs()
    .filter(([, violations]) => Boolean(_.size(violations)))
    .fromPairs()
    .value();
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
      }
      const fileContents = await readFile(filePath, 'utf8');
      return [filePath, linter.verify(fileContents, config)]
    })
    .value()
  )
  return _.fromPairs(pairs);
}


module.exports = queryPatternAge;