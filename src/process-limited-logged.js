const pLimit = require('p-limit');
const os = require('os');
const _ = require('lodash');
const log = require('./log');

const logInterval = 40;

// These types are not great.

// How can we make this handle arrays and objects?
// Can @templates have a 'extends'?

/**
 * 
 * @template E, Result
 * @param {Parameters<typeof log.logPhase>[0]} logOpts 
 * @param {Record<string | number, E> | E[]} elems 
 * @param {(elem: E, key: string | number) => Promise<Result>} processElem 
 * @returns {Promise<Result[]>}
 */
function processLimitedLogged(logOpts, elems, processElem) {
  // The type signature for pLimit is wrong.
  // @ts-ignore
  const limit = pLimit(os.cpus().length - 1);
  let countElemsProcessed = 0;

  return log.logPhase(
    logOpts,
    (logProgress) => {
      const promiseFns = _.map(elems, async (val, key) => {
        const result = await limit(processElem, val, key);
        countElemsProcessed++;
        if (!(countElemsProcessed % logInterval)) {
          logProgress({
            countComplete: countElemsProcessed, 
            totalCount: _.size(elems), 
            // It's obvious what 100 represents in this context.
            // eslint-disable-next-line no-magic-numbers
            percentage: Math.floor(countElemsProcessed / _.size(elems) * 100)
          });
        }
        return result;
      });
      return Promise.all(promiseFns);
    }
  );
}

module.exports = processLimitedLogged;