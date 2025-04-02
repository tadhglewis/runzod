#!/usr/bin/env node

import { run } from 'jscodeshift/src/Runner';
import { existsSync } from 'fs';
import path from 'path';

// Type for supported parsers
type Parser = 'ts' | 'tsx' | 'babel' | 'babylon' | 'flow' | 'css' | 'less' | 'scss' | 'json' | 'json5' | 'graphql';

// Parse command line options
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Error: No paths provided');
  showHelp();
  process.exit(1);
}

// Help flag
if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Process command line options
const paths = args.filter(arg => !arg.startsWith('-'));
const options = {
  dry: args.includes('--dry'),
  print: args.includes('--print'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  parser: getParserOption(args) || 'ts',
};

// Transform file path
const transformPath = path.resolve(__dirname, 'transform.js');

if (!existsSync(transformPath)) {
  console.error(`Error: Transform file not found at ${transformPath}`);
  process.exit(1);
}

// Run the transformation
run(transformPath, paths, options)
  .then(results => {
    if (options.verbose) {
      const stats = results as unknown as { 
        stats: { [messageName: string]: number };
        timeElapsed: string;
        error: number;
        ok: number;
        nochange: number;
        skip: number;
      };
      
      console.log(`Successfully processed ${stats.ok} files`);
      if (stats.error > 0) {
        console.error(`Failed to process ${stats.error} files`);
      }
    }
    
    // Check if there were errors
    const hasErrors = (results as any).error > 0;
    process.exit(hasErrors ? 1 : 0);
  })
  .catch(error => {
    console.error('Error during transformation:', error);
    process.exit(1);
  });

/**
 * Extract parser option from command line args
 */
function getParserOption(args: string[]): Parser | null {
  const parserIndex = args.findIndex(arg => arg === '--parser' || arg === '-p');
  if (parserIndex >= 0 && parserIndex < args.length - 1) {
    const parser = args[parserIndex + 1];
    if (['ts', 'tsx', 'babel', 'babylon', 'flow', 'css', 'less', 'scss', 'json', 'json5', 'graphql'].includes(parser)) {
      return parser as Parser;
    }
  }
  return null;
}

/**
 * Show help information
 */
function showHelp() {
  console.log(`
runzod - A codemod to migrate from runtypes to zod

Usage:
  npx runzod [options] <paths...>

Options:
  --dry            Dry run (no changes are made to files)
  --print          Print transformed files to stdout
  --parser, -p     The parser to use (default: ts)
  --verbose, -v    Show more information
  --help, -h       Show this help message

Examples:
  npx runzod src                        # Transform all files in src directory
  npx runzod --dry src/**/*.ts          # Dry run on all TypeScript files in src
  npx runzod --print file.ts            # Print transformed file to stdout

Description:
  This codemod converts runtypes validation schemas to zod schemas.
  It handles both pre and post v7 runtypes syntax.
  `);
}