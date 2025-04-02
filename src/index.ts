#!/usr/bin/env node

import path from 'path';
import { promisify } from 'util';
import { glob } from 'glob';
import { run as jscodeshiftRun } from 'jscodeshift/src/Runner';

async function run() {
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      console.error('Please provide a path to the directory containing files to transform');
      process.exit(1);
    }

    if (args[0] === '--help' || args[0] === '-h') {
      console.log(`
runzod - Migrate from runtypes to zod

Usage:
  runzod <directory> [options]

Options:
  --dry           Do not write to files, just show what would be changed
  --extensions    File extensions to process (default: ts,tsx)
  --help, -h      Show this help message
  --verbose, -v   Show more information during processing
      `);
      process.exit(0);
    }

    const targetPath = args[0];
    const isDryRun = args.includes('--dry');
    const verbose = args.includes('--verbose') || args.includes('-v');
    
    // Find extensions option
    const extIndex = args.findIndex(arg => arg === '--extensions');
    const extensions = extIndex !== -1 && args[extIndex + 1] 
      ? args[extIndex + 1].split(',') 
      : ['ts', 'tsx'];
    
    // Create pattern array for multiple extensions
    const patterns = extensions.map(ext => `${targetPath}/**/*.${ext}`);
    
    // Find all TypeScript files
    const files = await glob(patterns);
    
    if (files.length === 0) {
      console.error(`No files found in ${targetPath} with extensions: ${extensions.join(', ')}`);
      process.exit(1);
    }
    
    console.log(`Found ${files.length} files to process`);
    
    // Get the transform path
    const transformPath = path.resolve(__dirname, './transform.js');
    
    // Build the jscodeshift options
    const jscodeshiftOptions = {
      parser: 'ts',
      verbose: verbose ? 2 : 0,
      dry: isDryRun,
      print: isDryRun,
      extensions: extensions.join(','),
      ignorePattern: ['node_modules/**'],
      babel: false,
      runInBand: false,
      silent: !verbose,
      stdin: false
    };
    
    // Run jscodeshift directly
    try {
      const result = await jscodeshiftRun(
        transformPath,
        [targetPath],
        jscodeshiftOptions
      );
      
      if (result.ok) {
        console.log('Transformation complete!');
        console.log('Remember to:');
        console.log('1. Add "zod" to your dependencies if it\'s not already there');
        console.log('2. Check the transformed files manually for any issues');
        console.log('3. Run your tests to ensure everything still works');
      } else {
        console.error('Transformation encountered errors.');
      }
    } catch (jsError) {
      console.error('Error in jscodeshift transformation:', jsError);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Error running the transformation:', error);
    process.exit(1);
  }
}

run();