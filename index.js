const resolveFrom = require('resolve-from');
const dedent = require('dedent');
const {promisify} = require('util');
const _ = require('lodash');
const globby = require('globby');
const readFile = promisify(require('fs').readFile.bind(require('fs')));
const execa = require('execa');
const moment = require('moment');
const log = require('./src/log');
const processLimitedLogged = require('./src/process-limited-logged');

// TODO: Should this ditch ESLint and use https://github.com/estools/esquery directly?
// That would require the user specifying babel config. ESQuery takes an AST. Currently, ESLint handles parsing.

// TODO: The type around Commit is sloppy.

/* eslint-disable max-len */
/**
 * @param {object} options 
 * @param {string} options.astSelector
 * @param {boolean} options.survey
 * @param {string[]} options.paths
 * @param {string | undefined} options.after
 * @return {Promise<Omit<import("./types").Commit, 'filePath'>[] | {patternInstanceCount: number; filesWithInstanceCount: number, totalFilesSearchedCount: number; sampleFilesWithPattern: string[]}>}
 */
/* eslint-enable max-len */
async function queryPatternAge(options) {
  const files = await log.logPhase(
    {phase: 'finding files via globby', level: 'debug', ..._.pick(options, 'paths')},
    () => globby(options.paths, {
      // This is probably not necessary for correctness, because we filter out eslint-ignored files later.
      // But, for performance, let's omit ignorable files as early as possible.
      gitignore: true
    })
  );
  const eslintMainPath = getEslintPath();
  
  /** @type {import("eslint")} */
  const {CLIEngine, Linter} = require(eslintMainPath);
  const cliEngine = new CLIEngine({});

  const sampleFileCount = 10;
  const eslintReport = await log.logPhase(
    {
      phase: 'running ESLint on files', 
      level: 'debug', 
      countFiles: files.length, 
      ..._.pick(options, 'astSelector'),
      sampleFiles: _.take(files, sampleFileCount)
    }, 
    () => getEslintReports(cliEngine, Linter, files, options.astSelector)
  );

  log.trace({eslintReport});
  const locations = getLocations(eslintReport);
  log.trace({locations});

  if (options.survey) {
    const patternInstanceCount = _(locations)
      .mapValues('length')
      .values()
      .sum();

    const filesWithInstances = Object.keys(locations);

    return {
      patternInstanceCount, 
      filesWithInstanceCount: filesWithInstances.length,
      sampleFilesWithPattern: getSample(filesWithInstances, sampleFileCount),
      totalFilesSearchedCount: files.length
    };
  }

  const gitCommits = await getGitCommits(locations);

  const sortedGitCommits = _.sortBy(gitCommits, 'timestampS');

  if (!options.after) {
    return sortedGitCommits;
  }

  const afterTimestampS = moment(options.after, 'YYYY-M-D').unix();

  return _(gitCommits)
    .filter(({timestampS}) => timestampS >= afterTimestampS)
    .sortBy('timestampS')
    .value();
}

/**
 * To avoid randomness which would break tests, be consistent when running from unit tests.
 * This is a little naughty, I know. :)
 * 
 * @template T
 * @param {T[]} items 
 * @param {number} size 
 * @returns {T[]}
 */
function getSample(items, size) {
  return process.env.NODE_ENV === 'test' ? items.slice(0, size) : _.sampleSize(items, size);
}

/**
 * @param {ReturnType<typeof getLocations>} locations 
 * @returns {Promise<Record<string, Omit<import("./types").Commit, 'filePath'>>>}
 */
async function getGitCommits(locations) {

  /**
   * @param {import('type-fest').ValueOf<typeof locations>} locationsForFile 
   * @param {string} filePath 
   * @returns 
   */
  async function execGitForLocation(locationsForFile, filePath) {
    const locationParams = _(locationsForFile)
      .map(({line, endLine}) => ['-L', `${line},${endLine}`])
      .flatten()
      .value();
    const commandArgs = ['blame', filePath, ...locationParams, '--porcelain'];
    const command = 'git';
    const {stdout: gitResults} = await execa(command, commandArgs);

    const gitHashLength = 40;

    // I don't know how to declare this inline.
    /** @type {Omit<import("./types").Commit, 'count' | 'files'>[]} */
    const initialReducerValue = [];

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
          };
        }
        return {
          label: firstEntry,
          value: line.substring(firstSpaceIndex + 1)
        };
      }).reduce((acc, line, index, lines) => {
        if (line.label !== 'hash' || _.find(acc, {hash: line.value})) {
          return acc;
        }
        
        const linesAfterThisOne = lines.slice(index);

        /**
         * @param {string} label 
         */
        function demandLine(label) {
          const foundLine = _.find(linesAfterThisOne, {label});
          if (!foundLine) {
            throw new Error('Bug in this tool: did not find expected output in git blame.');
          }
          return foundLine;
        }

        return [...acc, {
          hash: line.value,
          filePath,
          command: `${command} ${commandArgs.join(' ')}`,
          timestampS: Number(demandLine('author-time').value),
          author: demandLine('author').value
        }];
      }, initialReducerValue);
  }

  const commits = await processLimitedLogged(
    {phase: 'getting git timestamps', level: 'debug', countFiles: _.size(locations)},
    locations,
    /** @ts-ignore I think this is just because I can't figure out how to have a @template extend another type. */
    execGitForLocation
  );

  log.debug({commits});

  return _(commits)
    .flattenDeep()
    .groupBy('hash')
    .mapValues(commits => ({
      count: commits.length,
      files: _.map(commits, 'filePath'),
      commands: _.map(commits, 'command'),
      ..._.omit(commits[0], 'filePath', 'command', 'count', 'files')
    }))
    .value();
}

/**
 * 
 * @template V
 * @param {Record<string, V>} object 
 * @param {(v: V, k: string) => boolean} predicate
 * @returns {Record<string, V>}
 */
function filterValues(object, predicate) {
  return _.reduce(object, (acc, val, key) => {
    if (predicate(val, key)) {
      return {...acc, [key]: val};
    }
    return acc;
  }, {});
}

/**
 * @param {{[filePath: string]: import("eslint").Linter.LintMessage[]}} eslintReport 
 */
function getLocations(eslintReport) {
  return filterValues(_.mapValues(
    eslintReport, 
    messages => 
      _(messages)
        // If the user has disables for custom rules, like "eslint-disable my-rule", that rule's config will not be 
        // found. Those errors don't matter for our purposes, so we'll ignore them.
        .filter({ruleId: 'no-restricted-syntax'})
        .map(message => _.pick(message, ['line', 'endLine']))
        .value()
  ), violations => Boolean(violations.length));
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
 * @param {{new(): import("eslint").Linter}} Linter 
 * @param {string[]} files 
 * @param {string} astSelector 
 * @return {Promise<{[filePath: string]: import("eslint").Linter.LintMessage[]}>}
 */
async function getEslintReports(cliEngine, Linter, files, astSelector) {
  const pairs = await Promise.all(_(files)
    .reject(filePath => cliEngine.isPathIgnored(filePath))
    .map(async filePath => {
      const linter = new Linter();

      const config = cliEngine.getConfigForFile(filePath);
      config.rules = {
        'no-restricted-syntax': [2, astSelector]
      };

      // If the config specifies a parser, like for @typescript-eslint, we need to manually register it.
      if (config.parser) {
        // https://eslint.org/docs/developer-guide/nodejs-api#linterdefineparser
        linter.defineParser(config.parser, require(config.parser));
      }

      // Normally, this is a good setting. However, given that we set rules to be solely no-restricted-syntax, we may
      // see disable directives that are now unused.
      // 
      // @ts-expect-error This type is missing, but should be there.
      config.reportUnusedDisableDirectives = false;

      log.trace({filePath, config}, 'Linting');
      const fileContents = await readFile(filePath, 'utf8');

      const lintReport = linter.verify(fileContents, config);

      // If the eslint config uses special preprocessors to handle files like .md files, then when we lint here,
      // we'll get a parse error. In this case, ruleId will be null.
      const parseError = _.find(lintReport, {ruleId: null});
      if (parseError) {
        throw new Error(dedent`File '${filePath}' could not be parsed. 
          If you want it to be parsed, then resolve the error that ESLint generated:
          
            "${parseError.message}"

          If you meant to ignore this file, update your 'paths' param to omit it. 
        `);
      }
        
      return [filePath, lintReport];
    })
    .value()
  );
  return _.fromPairs(pairs);
}

module.exports = queryPatternAge;