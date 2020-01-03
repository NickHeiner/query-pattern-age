#! /usr/bin/env node

const queryPatternAge = require('..');
const log = require('nth-log');
const _ = require('lodash');
const moment = require('moment');

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
    after: {
      string: true,
      description: 'A date (formated YYYY-M-D, like "2017-1-15") after which you want to see commits.'
    }
  })
  .check(argv => {
    if (argv.format === 'list-after' && !argv.after) {
      throw new Error('If --format is "list-after", then you must provide an --after date.')
    }
    return true;
  });

async function main() {
  try {
    log.trace(argv);
    const timestamps = await queryPatternAge(_.pick(argv, 'paths', 'astSelector', 'after'));
    // @ts-ignore type inference doesn't detect the type of format properly.
    format(timestamps, argv.format);
  } catch (e) {
    console.log(e);
    log.error(e);
    process.exit(1);
  }
}

/**
 * @param {{[timestamp: number]: number}} timestamps 
 * @param {'raw' | 'pretty'} format
 */
function format(timestamps, format) {
  if (format === 'raw') {
    console.log(JSON.stringify(timestamps));
    return;
  }

  _(timestamps)
    .map((count, timestamp) => {
      const msInSeconds = 1000;
      const date = moment(new Date(Number(timestamp) * msInSeconds));
      return {date, count};
    })
    .sortBy('date')
    .forEach(({date, count}) => {
      console.log(date.format('YYYY/MMM/DD'), _.repeat('█', count));
    });
}

main();