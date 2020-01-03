#! /usr/bin/env node

const queryPatternAge = require('..');
const log = require('nth-log');
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
    astPattern: {
      alias: 'a',
      string: true,
      description: 'An AST pattern to search for.'
    }
  });

async function main() {
  try {
    log.trace(argv);

    await queryPatternAge(_.pick(argv, 'paths', 'astPattern'));
  } catch (e) {
    console.log(e);
    log.error(e);
    process.exit(1);
  }
}

main();