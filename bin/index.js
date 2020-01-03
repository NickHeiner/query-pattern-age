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
    astSelector: {
      alias: 'a',
      string: true,
      demandOption: true,
      description: 
        'An AST selector to search for. See https://eslint.org/docs/developer-guide/selectors for more details.'
    }
  });

async function main() {
  try {
    log.trace(argv);
    await queryPatternAge(_.pick(argv, 'paths', 'astSelector'));
  } catch (e) {
    console.log(e);
    log.error(e);
    process.exit(1);
  }
}

main();