const resolveFrom = require('resolve-from');
const dedent = require('dedent');
const {promisify} = require('util');
const _ = require('lodash');
const globby = require('globby');
const readFile = promisify(require('fs').readFile.bind(require('fs')));
const execa = require('execa');
const moment = require('moment');
const log = require('nth-log');
const pLimit = require('p-limit');
const os = require('os');

/**
 * @param {object} options 
 * @param {string} options.astSelector
 * @param {string} options.after
 * @param {string[]} options.paths
 */
async function queryPatternAge(options) {
  const files = await log.logStep(
    {step: 'finding files via globby', level: 'debug'},
    async () => _.flatten(await Promise.all(options.paths.map(path => globby(path))))
  );
  const eslintMainPath = getEslintPath();
  
  /** @type {import("eslint")} */
  const {CLIEngine, Linter} = require(eslintMainPath);
  const cliEngine = new CLIEngine({});
  const linter = new Linter();

  const eslintReport = await log.logStep(
    {step: 'running ESLint on files', level: 'debug', countFiles: files.length}, 
    () => getEslintReports(cliEngine, linter, files, options.astSelector)
  );
  const locations = getLocations(eslintReport);
  const gitTimestamps = await log.logStep(
    {step: 'getting git timestamps', level: 'debug', countFiles: _.size(files)},
    (/** @type {any} */ logProgress) => getGitTimestamps(locations, logProgress)
  );

  if (!options.after) {
    return gitTimestamps;
  }

  const afterTimestampS = moment(options.after, 'YYYY-M-D').unix();

  return _(gitTimestamps)
    .filter(({timestampS}) => timestampS >= afterTimestampS)
    .sortBy('timestampS')
    .value();
}

/**
 * @param {ReturnType<typeof getLocations>} locations 
 * @param {Function} logProgress 
 */
async function getGitTimestamps(locations, logProgress) {
  const limit = pLimit(os.cpus().length - 1);
  let countFilesBlamed = 0;
  const timestampPromiseFns = _.map(locations, (locationsForFile, filePath) => {
    const locationParams = _(locationsForFile)
      .map(({line, endLine}) => ['-L', `${line},${endLine}`])
      .flatten()
      .value();
    return limit(async () => {
      const {stdout: gitResults} = await execa('git', ['blame', filePath, ...locationParams, '--porcelain']);

      countFilesBlamed++;
      const logInterval = 20;
      if (!(countFilesBlamed % logInterval)) {
        logProgress({
          countComplete: countFilesBlamed, 
          totalCount: _.size(locations), 
          percentage: Math.floor(countFilesBlamed / _.size(locations) * 100)
        })
      }

      const gitHashLength = 40;

      // TODO: To improve accuracy of results, emit a count of how often each commit appears in the blame, instead of
      // assuming that all commits occur equally often.
      return gitResults
        .split('\n')
        .map(line => {
          // I don't know which assumptions about the git output are safe to make.

          const firstSpaceIndex = line.indexOf(' ');
          const firstEntry = line.substring(0, firstSpaceIndex);
          if (firstEntry.length === gitHashLength) {
            return {
              label: 'hash',
              value: firstEntry
            }
          }
          return {
            label: firstEntry,
            value: line.substring(firstSpaceIndex + 1)
          }
        })
        .reduce((acc, line, index, lines) => {
          if (line.label !== 'hash' || _.find(acc, {hash: line.value})) {
            return acc;
          }
          
          const linesAfterThisOne = lines.slice(index);

          return [...acc, {
            hash: line.value,
            timestampS: _.find(linesAfterThisOne, {label: 'author-time'}).value,
            author: _.find(linesAfterThisOne, {label: 'author'}).value,
          }]
        }, []);
    });
  });

  const commits = await Promise.all(timestampPromiseFns);

  log.debug({commits});

  return _(commits)
    .flattenDeep()
    .map((commit, index, commits) => ({
      ...commit,
      count: _.filter(commits, _.pick(commit, 'hash')).length
    }))
    .uniqBy('hash')
    .value();
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