# query-pattern-age
Provide an AST pattern, and see details about when that pattern was introduced to your codebase.

![](./demo.png)

**Why is this useful?** Imagine that you have a large codebase with many contributors, and you want to understand how or why a pattern was introduced. For instance, you have a React app with multiple solutions for styling components: `glamor` and `styled-components`. You want to be able to answer questions like:

1. Which devs are using `glamor`, and which are using `styled-components`?
1. Chronologically, when has each package been used? Do we see a shift over time?

To search for a pattern, specify an [AST selector](https://eslint.org/docs/developer-guide/selectors) as it would be accepted by ESLint. To figure out what AST selector you need, you may find [AST Explorer](https://astexplorer.net/) useful. For instance, to search for `console.log()` calls, we'd pass:

```
--astSelector "CallExpression[callee.object.name=console][callee.property.name=log]"
```

The AST selector syntax is flexible, so you can search for a wide range of patterns. Because you're searching on the AST and not a direct string match, this is far more powerful than doing `grep` across your codebase.

### Survey Mode
If you don't need a git commit based view, but just want to see how many instances of the pattern exist, use the `--survey` flag:

```
$ query-pattern-age -p my/paths -a 'MySelector'
"750" instances of this pattern were found across "334" files. In total, "8427" files were searched. Sample files with this pattern:
* packages/example-1.js
* packages/example-2.js
* packages/example-3.js
* packages/example-4.js
* packages/example-5.js
```

## Usage
This package exports a command line tool, `query-pattern-age`, and an API, via `require('query-pattern-age')`. See the JSDoc typings in the main file of this package for an API reference.

```
$ query-pattern-age --help
Options:
  --help               Show help                                       [boolean]
  --version            Show version number                             [boolean]
  --paths, -p          globby-accepted patterns of the file paths to search
                                                              [array] [required]
  --astSelector, -a    An AST selector to search for. See
                       https://eslint.org/docs/developer-guide/selectors for
                       more details.                         [string] [required]
  --format, -f           [string] [choices: "raw", "pretty"] [default: "pretty"]
  --survey, -s         Instead of seeing git commits where this pattern was
                       introduced, just see a summary of how prevalent it is in
                       the codebase.                  [boolean] [default: false]
  --hashUrlFormat, -h  A URL format to use for linking hashes to their commit
                       web pages in terminal output. Pass a URL with "%s" in
                       place of the hash. For instance,
                       "https://github.com/org/repo/commit/%s". Unfortunately,
                       this makes the output of "--format pretty" look bad.
                                                                        [string]
  --after              A date (formated YYYY-M-D, like "2017-1-15") after which
                       you want to see commits.                         [string]
```

### ESLint Instance
When you invoke the command line tool, it runs `require.resolve('eslint')` in your curent working directory and uses it. This means that if you run this tool in your repo, and you have ESLint installed locally (as you should), that's the version that will be used.

If ESLint changes its command line interface, this tool could break.

## Who Shouldn't Use This
If you have a small codebase and a small team, this may be overkill. You can just talk to the individuals involved. This tool is for helping teams scale past the point where you can't name all the contributors off the top of your head.

## Limitations
Ignore time zones because for our granularity, it doesn't matter.

## Future Work
* Add more exhaustive tests