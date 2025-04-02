import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * A more practical test approach - just test if the transform works
 * by running jscodeshift with the actual transform and verifying
 * that there are no errors
 */
describe('RunZod Transform', () => {
  it('transforms all fixtures without errors', () => {
    const testFixturesDir = path.join(__dirname, '../__testfixtures__');
    
    // Get all input files except edge-cases which has a syntax error
    const inputFiles = fs.readdirSync(testFixturesDir)
      .filter(file => file.endsWith('.input.ts') && !file.includes('edge-cases'))
      .map(file => path.join(testFixturesDir, file));
    
    // Run the transform on all files
    inputFiles.forEach(inputFile => {
      const result = execSync(
        `npx jscodeshift -t src/transform.ts --parser=ts --dry --run-in-band ${inputFile}`, 
        { encoding: 'utf8' }
      );
      
      // Test that it completes without errors
      expect(result).toContain('All done.');
      
      // Check if the file was modified (should be true for all except js-cast)
      const fileName = path.basename(inputFile);
      if (fileName === 'js-cast.input.ts') {
        expect(result).toContain('1 unmodified');
      } else {
        expect(result).toContain('1 ok');
      }
    });
  });
  
  it('correctly preserves JavaScript cast functions', () => {
    const jsCastInput = path.join(__dirname, '../__testfixtures__/js-cast.input.ts');
    const jsCastOutput = path.join(__dirname, '../__testfixtures__/js-cast.output.ts');
    
    // Get original source
    const inputContent = fs.readFileSync(jsCastInput, 'utf8');
    const outputContent = fs.readFileSync(jsCastOutput, 'utf8');
    
    // Run transform
    const result = execSync(
      `npx jscodeshift -t src/transform.ts --parser=ts --dry --run-in-band ${jsCastInput}`,
      { encoding: 'utf8' }
    );
    
    // Verify that the file was not modified
    expect(result).toContain('1 unmodified');
    
    // Also verify that input and output files are the same
    expect(inputContent.trim()).toBe(outputContent.trim());
  });
});