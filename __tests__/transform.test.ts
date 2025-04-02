import * as path from 'path';
import { applyTransform } from 'jscodeshift/dist/testUtils';
import * as fs from 'fs';
import { describe, it, expect } from 'vitest';

// Import the transformer
import transformer from '../src/transform';

// Define test cases with input and output files
const testCases = [
  'namespace-simple'
];

// Run tests for each test case
describe('runzod transformer', () => {
  testCases.forEach(testCase => {
    it(`transforms ${testCase} correctly`, () => {
      // Set up file paths
      const fixtureDir = path.join(process.cwd(), '__testfixtures__');
      const inputPath = path.join(fixtureDir, `${testCase}.input.ts`);
      const outputPath = path.join(fixtureDir, `${testCase}.output.ts`);
      
      // Run the transform
      const output = applyTransform(
        transformer,
        { parser: 'ts' },
        { path: inputPath, source: fs.readFileSync(inputPath, 'utf8') }
      );
      
      // Compare with expected output
      const expected = fs.readFileSync(outputPath, 'utf8');
      expect(output.trim()).toEqual(expected.trim());
    });
  });
});