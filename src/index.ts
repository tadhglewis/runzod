#!/usr/bin/env node

import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { glob } from 'glob';

const execAsync = promisify(exec);

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
    
    const extensionPattern = extensions.map(ext => `**/*.${ext}`).join(',');
    
    // Find all TypeScript files
    const files = await glob(`${targetPath}/${extensionPattern}`);
    
    if (files.length === 0) {
      console.error(`No files found in ${targetPath} with extensions: ${extensions.join(', ')}`);
      process.exit(1);
    }
    
    console.log(`Found ${files.length} files to process`);
    
    // Build the jscodeshift command
    const jscodeshiftBin = path.resolve(__dirname, '../node_modules/.bin/jscodeshift');
    const transformPath = path.resolve(__dirname, './transform.js');
    
    const dryRunFlag = isDryRun ? '--dry' : '';
    const printFlag = isDryRun ? '--print' : '';
    
    const command = `${jscodeshiftBin} -t ${transformPath} ${dryRunFlag} ${printFlag} --parser=ts --extensions=${extensions.join(',')} ${targetPath}`;
    
    if (verbose) {
      console.log(`Executing: ${command}`);
    }
    
    // Run the transformation
    const { stdout, stderr } = await execAsync(command);
    
    if (verbose) {
      console.log(stdout);
    }
    
    if (stderr && verbose) {
      console.error(stderr);
    }
    
    console.log('Transformation complete!');
    console.log('Remember to:');
    console.log('1. Add "zod" to your dependencies if it\'s not already there');
    console.log('2. Check the transformed files manually for any issues');
    console.log('3. Run your tests to ensure everything still works');
  } catch (error) {
    console.error('Error running the transformation:', error);
    process.exit(1);
  }
}

run();