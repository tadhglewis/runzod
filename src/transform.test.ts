import { describe, expect, test } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as jscodeshift from 'jscodeshift';
import transform from './transform';

const TEST_FIXTURES_DIR = path.join(__dirname, '../__testfixtures__');

// Helper function to run a test case
function runTest(name: string) {
  const inputPath = path.join(TEST_FIXTURES_DIR, `${name}.input.ts`);
  const outputPath = path.join(TEST_FIXTURES_DIR, `${name}.output.ts`);
  
  const source = fs.readFileSync(inputPath, 'utf8');
  const expected = fs.readFileSync(outputPath, 'utf8');
  
  const output = transform(
    { source, path: inputPath },
    { jscodeshift, stats: () => {} } as any,
    {}
  );
  
  return { output, expected };
}

describe('runtypes to zod transform', () => {
  test('basic usage transformation', () => {
    const { output, expected } = runTest('basic');
    expect(output.trim()).toBe(expected.trim());
  });
  
  test('branded types transformation', () => {
    const { output, expected } = runTest('branded');
    expect(output.trim()).toBe(expected.trim());
  });
  
  test('complex types transformation', () => {
    const { output, expected } = runTest('complex');
    expect(output.trim()).toBe(expected.trim());
  });
});

// Test specific transformations
describe('specific transformations', () => {
  test('transforms runtypes imports to zod', () => {
    const source = `import { String, Number } from "runtypes";`;
    const expected = `import * as z from "zod";\n`;
    
    const output = transform(
      { source, path: 'test.ts' },
      { jscodeshift, stats: () => {} } as any,
      {}
    );
    
    expect(output).toBe(expected);
  });
  
  test('transforms basic type declarations', () => {
    const source = `
      import { Object, String, type Static } from "runtypes";
      const User = Object({ name: String });
      type User = Static<typeof User>;
    `;
    
    const expected = `
      import * as z from "zod";
      const User = z.object({ name: z.string() });
      type User = z.infer<typeof User>;
    `;
    
    const output = transform(
      { source, path: 'test.ts' },
      { jscodeshift, stats: () => {} } as any,
      {}
    );
    
    // Normalize whitespace for comparison
    const normalizedOutput = output.replace(/\s+/g, ' ').trim();
    const normalizedExpected = expected.replace(/\s+/g, ' ').trim();
    
    expect(normalizedOutput).toBe(normalizedExpected);
  });
  
  test('transforms withConstraint to refine', () => {
    const source = `
      import { String } from "runtypes";
      const Email = String.withConstraint(email => /\\S+@\\S+\\.\\S+/.test(email) || "Invalid email");
    `;
    
    const expected = `
      import * as z from "zod";
      const Email = z.string().refine(email => /\\S+@\\S+\\.\\S+/.test(email), "Invalid email");
    `;
    
    const output = transform(
      { source, path: 'test.ts' },
      { jscodeshift, stats: () => {} } as any,
      {}
    );
    
    // Normalize whitespace for comparison
    const normalizedOutput = output.replace(/\s+/g, ' ').trim();
    const normalizedExpected = expected.replace(/\s+/g, ' ').trim();
    
    expect(normalizedOutput).toBe(normalizedExpected);
  });
  
  test('transforms guard to safeParse', () => {
    const source = `
      import { Object, String } from "runtypes";
      const User = Object({ name: String });
      
      function process(data: unknown) {
        if (User.guard(data)) {
          return data.name;
        }
        return null;
      }
    `;
    
    const expected = `
      import * as z from "zod";
      const User = z.object({ name: z.string() });
      
      function process(data: unknown) {
        if (User.safeParse(data).success) {
          return data.name;
        }
        return null;
      }
    `;
    
    const output = transform(
      { source, path: 'test.ts' },
      { jscodeshift, stats: () => {} } as any,
      {}
    );
    
    // Normalize whitespace for comparison
    const normalizedOutput = output.replace(/\s+/g, ' ').trim();
    const normalizedExpected = expected.replace(/\s+/g, ' ').trim();
    
    expect(normalizedOutput).toBe(normalizedExpected);
  });
});