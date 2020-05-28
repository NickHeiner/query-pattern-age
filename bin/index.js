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
      choices: ['raw', 'pretty'],
      default: 'pretty'
    },
    hashUrlFormat: {
      alias: 'h',
      string: true,
      description: 'A URL format to use for linking hashes to their commit web pages in terminal output. ' +
        'Pass a URL with "%s" in place of the hash. For instance, "https://github.com/org/repo/commit/%s". ' +
        'Unfortunately, this makes the output of --format pretty look bad.'
    },
    after: {
      string: true,
      description: 'A date (formated YYYY-M-D, like "2017-1-15") after which you want to see commits.'
    }
  });

async function main() {
  try {
    log.trace(argv);
    const commits = await queryPatternAge(_.pick(argv, 'paths', 'astSelector', 'after'));
    // @ts-ignore type inference doesn't detect the type of format properly.
    format(commits, argv.format, argv.hashUrlFormat);
  } catch (e) {
    // Just stringifying the error may omit some fields we care about.
    console.log(e);
    process.exit(1);
  }
}

/**
 * 
 * @param {number} timestampS 
 */
function dateOfTimestamp(timestampS) {
  const msInSeconds = 1000;
  return moment(new Date(Number(timestampS) * msInSeconds));
}

/**
 * 
 * @param {import("moment").Moment} date 
 */
function formatDate(date) {
  return date.format('YYYY/MMM/DD');
}

/**
 * @param {import("../types").Commit[]} commits 
 * @param {'raw' | 'pretty' | 'pretty'} format
 * @param {string} hashUrlFormat
 */
function format(commits, format, hashUrlFormat) {
  if (format === 'raw') {
    console.log(JSON.stringify(commits));
    return;
  }

  if (format === 'pretty') {
    const table = new CliTable({
      head: ['Date', 'Committer', 'Occurrence Count', 'Files', 'Hash']
    });

    // CliTable types are wrong.
    // @ts-ignore
    commits.forEach(({hash, timestampS, author, count, files}) => table.push([
      formatDate(dateOfTimestamp(timestampS)), 
      author, 
      // This breaks the table format, because the layout manager doesn't know how to interpret the non-rendered
      // characters in a link. I don't think it's worth fixing now.
      count,
      files.join('\n'),
      hashUrlFormat ? terminalLink(hash, hashUrlFormat.replace('%s', hash)) : hash
    ]));
    console.log(table.toString());
  }
}

main();