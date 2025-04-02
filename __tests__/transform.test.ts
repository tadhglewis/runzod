import { FileInfo } from 'jscodeshift';
import fs from 'fs';
import path from 'path';
import transform from '../src/transform';

const defineTest = (dirName: string, transformName: string, options: object, testFilePrefix: string) => {
  const fixtureDir = path.join(dirName, '__testfixtures__');
  const inputPath = path.join(fixtureDir, `${testFilePrefix}.input.ts`);
  const outputPath = path.join(fixtureDir, `${testFilePrefix}.output.ts`);
  
  test(`${testFilePrefix} transforms correctly`, () => {
    // Read the input and expected output
    const input = fs.readFileSync(inputPath, 'utf8');
    const expected = fs.readFileSync(outputPath, 'utf8');
    
    // Setup mock file info
    const fileInfo: FileInfo = {
      path: inputPath,
      source: input,
    };
    
    // Mock jscodeshift API
    const j = require('jscodeshift');
    const api = { 
      jscodeshift: j,
      j,
      stats: () => {},
      report: () => {}
    };
    
    // Apply transformation
    const output = transform(fileInfo, api, options);
    
    // Compare the output with expected result
    expect(output).toBe(expected);
  });
};

// Run tests
describe('runzod transformation', () => {
  defineTest(__dirname + '/..', 'transform', {}, 'basic');
});
