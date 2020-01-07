#! /usr/bin/env node

const queryPatternAge = require('..');
const log = require('nth-log');
const _ = require('lodash');
const moment = require('moment');
const CliTable = require('cli-table3');
const terminalLink = require('terminal-link');

const {argv} = require('yargs')
  .options({
    paths: {
      alias: 'p',
      array: true,
      string: true,
      demandOption: true,
      description: 'globby-accepted patterns of the file paths to search'
    },
    astSelector: {
      alias: 'a',
      string: true,
      demandOption: true,
      description: 
        'An AST selector to search for. See https://eslint.org/docs/developer-guide/selectors for more details.'
    },
    format: {
      alias: 'f',
      string: true, 
      choices: ['raw', 'pretty', 'list-after'],
      default: 'pretty'
    },
    hashUrlFormat: {
      alias: 'h',
      string: true,
      description: 'A URL format to use for linking hashes to their commit web pages in terminal output. ' +
        'Pass a URL with "%s" in place of the hash. For instance, "https://github.com/org/repo/commit/%s"'
    },
    after: {
      string: true,
      description: 'A date (formated YYYY-M-D, like "2017-1-15") after which you want to see commits.'
    }
  })
  .check(argv => {
    if (argv.format === 'list-after' && !argv.after) {
      throw new Error('If --format is "list-after", then you must provide an --after date.');
    }
    return true;
  });

async function main() {
  try {
    log.trace(argv);
    const timestamps = await queryPatternAge(_.pick(argv, 'paths', 'astSelector', 'after'));
    // @ts-ignore type inference doesn't detect the type of format properly.
    format(timestamps, argv.format, argv.hashUrlFormat);
  } catch (e) {
    console.log(e);
    log.error(e);
    process.exit(1);
  }
}

/**
 * 
 * @param {number} timestampS 
 */
function dateOfTimestamp(timestampS) {
  const msInSeconds = 1000;
  return moment(new Date(Number(timestampS) * msInSeconds))
}

/**
 * 
 * @param {import("moment").Moment} date 
 */
function formatDate(date) {
  return date.format('YYYY/MMM/DD')
}

/**
 * @param {{[timestamp: number]: number}} commits 
 * @param {'raw' | 'pretty' | 'list-after'} format
 * @param {string} hashUrlFormat
 */
function format(commits, format, hashUrlFormat) {
  if (format === 'raw') {
    console.log(JSON.stringify(commits));
    return;
  }

  if (format === 'list-after') {
    const table = new CliTable({
      head: ['Date', 'Committer', 'Hash']
    });

    commits.forEach(({hash, timestampS, author}) => table.push([
      formatDate(dateOfTimestamp(timestampS)), 
      author, 
      // This breaks the table format, because the layout manager doesn't know how to interpret the non-rendered
      // characters in a link. I don't think it's worth fixing now.
      hashUrlFormat ? terminalLink(hash, hashUrlFormat.replace('%s', hash)) :  hash
    ]));
    console.log(table.toString());
    return;
  }

  _(commits)
    .map((count, timestamp) => {
      const date = dateOfTimestamp(timestamp);
      return {date, count};
    })
    .sortBy('date')
    .forEach(({date, count}) => {
      console.log(formatDate(date), _.repeat('█', count));
    });
}

main();