const globby = require('globby');
const log = require('./log');
const _ = require('lodash');
const processLimitedLogged = require('./process-limited-logged');
const execa = require('execa');

/**
 * 
 * This assumes that the current working directory is the repo being analyzed.
 * 
 * @param {object} options 
 * @param {string | undefined} options.after 
 * @param {string[]} options.paths 
 * @returns 
 */
async function queryFileEditCount(options) {
  const files = await log.logPhase(
    {phase: 'finding files via globby', level: 'debug', ..._.pick(options, 'paths')},
    () => globby(options.paths, {gitignore: true})
  );

  const revListArgs = ['rev-list', '--reverse'];
  if (options.after) {
    revListArgs.push(`--since=${options.after}`);
  }
  revListArgs.push('HEAD');
  const {stdout: revListResult} = await execa('git', revListArgs);
  const commitToStartFrom = revListResult.split('\n')[0];

  log.debug({commitToStartFrom}, 'Found oldest commit to consider');

  const gitLogResults = await processLimitedLogged(
    {phase: 'running git log', level: 'debug', fileCount: files.length},
    files,
    async file => {
      const {stdout: gitResults} = await execa('git', ['log', '--oneline', `${commitToStartFrom}..HEAD`, '--', file]);
      const commitCount = gitResults === '' ? 0 : gitResults.trim().split('\n').length;
      return [file, commitCount];
    }  
  );

  return _.sortBy(gitLogResults, ([, logLineCount]) => -logLineCount);
}

module.exports = queryFileEditCount;

