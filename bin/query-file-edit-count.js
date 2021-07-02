#! /usr/bin/env node

const queryFileEditCount = require('../src/query-file-edit-count');
const log = require('../src/log');
const _ = require('lodash');

const {argv} = require('yargs')
  .options({
    paths: {
      alias: 'p',
      array: true,
      string: true,
      demandOption: true,
      description: 'globby-accepted patterns of the file paths to search'
    },
    after: {
      string: true,
      description: 'A date (formated YYYY-M-D, like "2017-1-15") after which you want to see commits.'
    }
  });

async function main() {
  try {
    log.trace(argv);
    const result = await queryFileEditCount(_.pick(argv, 'paths', 'after'));
    console.log(result);
  } catch (e) {
    // Just stringifying the error may omit some fields we care about.
    console.log(e);
    process.exit(1);
  }
}

main();