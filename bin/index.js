#! /usr/bin/env deno

/* global process */

import { parse } from 'https://deno.land/std@0.200.0/flags/mod.ts';
import { streamParse, Context, AgastContext } from 'bablr';
import { embeddedSourceFrom, readFromStream, stripTrailingNewline } from '@bablr/helpers/source';
import { debugEnhancers } from '@bablr/helpers/enhancers';
import colorSupport from 'color-support';
import { evaluateIO } from '@bablr/io-vm-node';
import { createPrintCSTMLStrategy } from '../lib/syntax.js';
import { buildFullyQualifiedSpamMatcher } from '@bablr/agast-vm-helpers';

const parseArguments = (args) => {
  const booleanArgs = ['format', 'no-format', 'verbose'];

  const stringArgs = ['langauge', 'production', 'color', 'embedded'];

  const alias = {
    language: 'l',
    production: 'p',
    format: 'f',
    'no-format': 'F',
    verbose: 'v',
    color: 'c',
    embedded: 'e',
  };

  return parse(args, {
    alias,
    boolean: booleanArgs,
    string: stringArgs,
    stopEarly: false,
    '--': true,
    default: {
      color: 'auto',
      format: true,
    },
  });
};

// program
//   .option('-l, --language [URL]', 'The URL of the top BABLR language')
//   .option('-p, --production [type]', 'The name of the top production type')
//   .option('-f, --format', 'Pretty-format CSTML output', true)
//   .option('-F, --no-format')
//   .option('-v, --verbose', 'Prints debugging information to stderr')
//   .option(
//     '-c, --color [WHEN]',
//     'When to use ANSI escape colors \n  WHEN: "auto" | "always" | "never"',
//     'auto',
//   )
//   .option('-e, --embedded', 'Requires quoted input but enables gap parsing')
//   .parse(process.argv);

const programOpts = parseArguments(Deno.args);

if (programOpts.color && !['auto', 'always', 'never'].includes(programOpts.color.toLowerCase())) {
  throw new Error('invalid value for --color');
}

const options = {
  ...programOpts,
  color:
    (programOpts.color.toLowerCase() === 'auto' && colorSupport.hasBasic) ||
    programOpts.color.toLowerCase() === 'always',
};

const language = await import(`npm:${options.language}`);

const matcher = buildFullyQualifiedSpamMatcher({}, language.canonicalURL, options.production);

const logStderr = (...args) => {
  Deno.stderr.write(args.join(' ') + '\n');
};

const enhancers = options.verbose ? { ...debugEnhancers, agast: null } : {};

const ctx = Context.from(AgastContext.create(), language, enhancers.bablrProduction);

const rawStream = Deno.stdin.readable.pipeThrough(new TextDecoderStream());

await evaluateIO(
  createPrintCSTMLStrategy(
    streamParse(
      ctx,
      matcher,
      options.embedded
        ? embeddedSourceFrom(readFromStream(rawStream))
        : stripTrailingNewline(readFromStream(rawStream)),
      {},
      { enhancers, emitEffects: true },
    ),
    {
      ctx,
      emitEffects: !!options.verbose,
      color: options.color,
      format: options.format,
    },
  ),
);
