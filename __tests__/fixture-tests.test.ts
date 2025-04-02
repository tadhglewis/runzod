import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Function to normalize code for reliable comparison
 * We normalize just enough to handle formatting differences but preserve content
 */
function normalizeCode(code: string): string {
  return code
    .trim()
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    // Normalize quotes
    .replace(/'/g, '"')
    // Normalize whitespace in specific patterns, not ALL whitespace
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*{\s*/g, ' { ')
    .replace(/\s*}\s*/g, ' } ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s*\[\s*/g, '[')
    .replace(/\s*\]\s*/g, ']');
}

/**
 * Run the transform and get the output, filtering jscodeshift logs
 */
function getTransformOutput(inputFile: string): string {
  // Run the transform on the input file
  let result = '';
  try {
    result = execSync(
      `npx jscodeshift -t src/transform.ts --parser=ts --print --dry --run-in-band ${inputFile}`,
      { encoding: 'utf8' }
    );
  } catch (error) {
    console.error('Error running transform:', error);
    return '';
  }
  
  // Extract just the transformed code, not the jscodeshift logs
  const lines = result.split('\n');
  
  // Find the start line (after the initial logs)
  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Running in dry mode')) {
      startLine = i + 1;
      break;
    }
  }
  
  // Find the end line (before the final stats)
  let endLine = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('All done.')) {
      endLine = i;
      break;
    }
  }
  
  // If finding the transformed code did not work, but we know the file was unmodified,
  // then return the original input file content
  if (startLine >= endLine || (endLine - startLine) < 2) {
    if (result.includes('unmodified')) {
      return fs.readFileSync(inputFile, 'utf8');
    }
    return '';
  }
  
  return lines.slice(startLine, endLine).join('\n').trim();
}

/**
 * Test each fixture to ensure it matches expected output exactly
 */
describe('RunZod Fixture Tests', () => {
  // Test all fixtures except edge-cases (which has a syntax error)
  const testFixturesDir = path.join(__dirname, '../__testfixtures__');
  const inputFiles = fs.readdirSync(testFixturesDir)
    .filter(file => file.endsWith('.input.ts') && !file.includes('edge-cases'))
    .map(file => path.basename(file, '.input.ts'));
  
  // For each fixture, test that the transform produces the expected output
  inputFiles.forEach(fixtureName => {
    it(`transforms ${fixtureName} correctly`, () => {
      const inputFile = path.join(testFixturesDir, `${fixtureName}.input.ts`);
      const outputFile = path.join(testFixturesDir, `${fixtureName}.output.ts`);
      
      // Get the expected output
      const expectedOutput = fs.readFileSync(outputFile, 'utf8');
      
      // Run the transform
      const actualOutput = getTransformOutput(inputFile);
      
      // Normalize both for comparison
      const normalizedExpected = normalizeCode(expectedOutput);
      const normalizedActual = normalizeCode(actualOutput);
      
      // If there's a mismatch, log the difference for easier debugging
      if (normalizedExpected !== normalizedActual) {
        console.log('=== MISMATCH IN FIXTURE: ' + fixtureName + ' ===');
        console.log('EXPECTED:');
        console.log(normalizedExpected);
        console.log('ACTUAL:');
        console.log(normalizedActual);
      }
      
      // The transformed code should match the expected output exactly
      expect(normalizedActual).toBe(normalizedExpected);
    });
  });
});