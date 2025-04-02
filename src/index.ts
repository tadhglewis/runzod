#!/usr/bin/env node

import path from 'path';
import { run } from 'jscodeshift/src/Runner';
import fs from 'fs';

// Get the target paths from command line arguments
const [,, ...targetPaths] = process.argv;

if (targetPaths.length === 0) {
  console.error('Usage: npx runzod <path-to-directory-or-file>');
  process.exit(1);
}

// Copy the simple-transform.js to dist folder 
function copyTransformFile() {
  try {
    const sourceTransform = path.resolve(__dirname, '../simple-transform.js');
    const targetTransform = path.join(__dirname, 'transform.js');
    
    if (fs.existsSync(sourceTransform)) {
      fs.copyFileSync(sourceTransform, targetTransform);
      return targetTransform;
    }
  } catch (error) {
    console.warn('Could not copy transform file:', error);
  }
  
  // Fallback to the default location
  return path.join(__dirname, 'transform.js');
}

// Run the codemod
const transformPath = copyTransformFile();
const options = {
  dry: false,
  print: false,
  babel: true,
  extensions: 'ts,tsx,js,jsx',
  ignorePattern: ['**/node_modules/**', '**/dist/**'],
  ignoreConfig: undefined,
  silent: false,
  parser: 'ts',
  verbose: 1,
  runInBand: false,
};

console.log(`Running runtypes to zod migration on: ${targetPaths.join(', ')}`);
console.log('This will modify your files in place. Make sure you have a backup or version control.');

run(transformPath, targetPaths, options)
  .then(results => {
    console.log('Migration completed!');
    console.log(`Files processed: ${results.ok + results.nochange + results.skip + results.error}`);
    console.log(`Files changed: ${results.ok}`);
  })
  .catch(error => {
    console.error('Error during migration:', error);
    process.exit(1);
  });