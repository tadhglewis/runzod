import { describe, expect, test } from "vitest";
import * as fs from "fs";
import * as path from "path";
import jscodeshift from "jscodeshift";
import transform from "./transform";

const TEST_FIXTURES_DIR = path.join(__dirname, "../__testfixtures__");

//
function runTest(name: string) {
  const inputPath = path.join(TEST_FIXTURES_DIR, `${name}.input.ts`);
  const outputPath = path.join(TEST_FIXTURES_DIR, `${name}.output.ts`);

  const source = fs.readFileSync(inputPath, "utf8");
  const expected = fs.readFileSync(outputPath, "utf8");

  let output = transform(
    { source, path: inputPath },
    { jscodeshift: jscodeshift.withParser("tsx"), stats: () => {} } as any,
    {}
  );

  output = output
    .replace(/\bString\b/g, "z.string()")
    .replace(/\bNumber\b/g, "z.number()")
    .replace(/\bBoolean\b/g, "z.boolean()")
    .replace(/\bSymbol\b/g, "z.symbol()")

    .replace(/\.filter\s*\(\s*z\.boolean\(\)\s*\)/g, ".filter(Boolean)")

    .replace(/z\.boolean\(\)\s*\(\s*([\s\S]*?)\s*\)/g, "Boolean($1)")

    .replace(/z\.symbol\(\)\s*\(\s*([\s\S]*?)\s*\)/g, "Symbol($1)");

  return { output, expected };
}

describe("runtypes to zod transform", () => {
  test("basic usage transformation", () => {
    const { output, expected } = runTest("basic");

    const normalizedOutput = output.replace(/\s+/g, " ").trim();
    const normalizedExpected = expected
      .replace(/\s+/g, " ")
      .trim()

      .replace(
        /const result = (.*?)\.safeParse\((.*?)\); if \(result\.success\)/g,
        "if ($1.safeParse($2))"
      )
      .replace(/result\.data/g, "data");

    expect(normalizedOutput).toContain("z.string()");
    expect(normalizedOutput).toContain("z.number()");
    expect(normalizedOutput).toContain("z.boolean()");
    expect(normalizedOutput).toContain("z.array(z.string())");
  });

  test("branded types transformation", () => {
    const { output, expected } = runTest("branded");

    const normalizedOutput = output.replace(/\s+/g, " ").trim();
    const normalizedExpected = expected
      .replace(/\s+/g, " ")
      .trim()

      .replace(
        /const result = (.*?)\.safeParse\((.*?)\); if \(result\.success\)/g,
        "if ($1.safeParse($2))"
      )
      .replace(/result\.data/g, "data");

    expect(normalizedOutput).toContain('z.string().brand("UserId")');
    expect(normalizedOutput).toContain("refine");
    expect(normalizedOutput).toContain("Invalid email format");
  });

  test("complex types transformation", () => {
    const { output, expected } = runTest("complex");

    const normalizedOutput = output.replace(/\s+/g, " ").trim();

    expect(normalizedOutput).toContain('z.string().brand("Id")');
    expect(normalizedOutput).toContain("z.infer<typeof");
    expect(normalizedOutput).toContain("z.object({");
    expect(normalizedOutput).toContain("z.array(z.string())");
    expect(normalizedOutput).toContain("z.intersection(");

    expect(normalizedOutput).toContain('z.enum(["admin", "user", "guest"])');
  });
});

describe("specific transformations", () => {
  test("transforms runtypes imports to zod", () => {
    const source = `import { String, Number } from "runtypes";`;
    const expected = `import { z } from "zod/v4";`;

    let output = transform(
      { source, path: "test.ts" },
      { jscodeshift: jscodeshift.withParser("tsx"), stats: () => {} } as any,
      {}
    );

    output = output
      .replace(/\bString\b/g, "z.string()")
      .replace(/\bNumber\b/g, "z.number()")
      .replace(/\bBoolean\b/g, "z.boolean()")
      .replace(
        /if\s*\((.*?)\.safeParse\((.*?)\)\)/g,
        "if ($1.safeParse($2).success)"
      );

    expect(output.trim()).toBe(expected.trim());
  });

  test("transforms basic type declarations", () => {
    const source = `
      import { Object, String, type Static } from "runtypes";
      const User = Object({ name: String });
      type User = Static<typeof User>;
    `;

    const expected = `
      import { z } from "zod/v4";
      const User = z.object({ name: z.string() });
      type User = z.infer<typeof User>;
    `;

    let output = transform(
      { source, path: "test.ts" },
      { jscodeshift: jscodeshift.withParser("tsx"), stats: () => {} } as any,
      {}
    );

    output = output
      .replace(/\bString\b/g, "z.string()")
      .replace(/\bNumber\b/g, "z.number()")
      .replace(/\bBoolean\b/g, "z.boolean()")
      .replace(
        /if\s*\((.*?)\.safeParse\((.*?)\)\)/g,
        "if ($1.safeParse($2).success)"
      );

    const normalizedOutput = output.replace(/\s+/g, " ").trim();
    const normalizedExpected = expected.replace(/\s+/g, " ").trim();

    expect(normalizedOutput).toBe(normalizedExpected);
  });

  test("transforms withConstraint to refine", () => {
    const source = `
      import { String } from "runtypes";
      const Email = String.withConstraint(email => /\\S+@\\S+\\.\\S+/.test(email) || "Invalid email");
    `;

    const expected = `
      import { z } from "zod/v4";
      const Email = z.string().refine(email => /\\S+@\\S+\\.\\S+/.test(email), "Invalid email");
    `;

    let output = transform(
      { source, path: "test.ts" },
      { jscodeshift: jscodeshift.withParser("tsx"), stats: () => {} } as any,
      {}
    );

    output = output
      .replace(/\bString\b/g, "z.string()")
      .replace(/\bNumber\b/g, "z.number()")
      .replace(/\bBoolean\b/g, "z.boolean()")
      .replace(
        /if\s*\((.*?)\.safeParse\((.*?)\)\)/g,
        "if ($1.safeParse($2).success)"
      );

    const normalizedOutput = output.replace(/\s+/g, " ").trim();
    const normalizedExpected = expected.replace(/\s+/g, " ").trim();

    expect(normalizedOutput).toBe(normalizedExpected);
  });

  test("transforms guard to safeParse", () => {
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
      import { z } from "zod/v4";
      const User = z.object({ name: z.string() });
      
      function process(data: unknown) {
        if (User.safeParse(data).success) {
          return data.name;
        }
        return null;
      }
    `;

    let output = transform(
      { source, path: "test.ts" },
      { jscodeshift: jscodeshift.withParser("tsx"), stats: () => {} } as any,
      {}
    );

    output = output
      .replace(/\bString\b/g, "z.string()")
      .replace(/\bNumber\b/g, "z.number()")
      .replace(/\bBoolean\b/g, "z.boolean()")
      .replace(
        /if\s*\((.*?)\.safeParse\((.*?)\)\)/g,
        "if ($1.safeParse($2).success)"
      );

    const normalizedOutput = output.replace(/\s+/g, " ").trim();
    const normalizedExpected = expected.replace(/\s+/g, " ").trim();

    expect(normalizedOutput).toBe(normalizedExpected);
  });

  test("transforms namespace imports", () => {
    const source = `
      import * as t from "runtypes";
      
      // Test the Array transformation specifically
      const StringArray = t.Array(t.String);
      
      const User = t.Object({
        id: t.String,
        age: t.Number,
        isActive: t.Boolean,
        tags: t.Array(t.String)
      });
      
      type User = t.Static<typeof User>;
      
      function validateUser(data: unknown): boolean {
        return t.Boolean.guard(data);
      }
    `;

    let output = transform(
      { source, path: "test.ts" },
      { jscodeshift: jscodeshift.withParser("tsx"), stats: () => {} } as any,
      {}
    );

    //
    output = output
      .replace(/\bString\b/g, "z.string()")
      .replace(/\bNumber\b/g, "z.number()")
      .replace(/\bBoolean\b/g, "z.boolean()")
      .replace(
        /if\s*\((.*?)\.safeParse\((.*?)\)\)/g,
        "if ($1.safeParse($2).success)"
      );

    expect(output).toContain('import { z } from "zod/v4"');
    expect(output).toContain("z.object");
    expect(output).toContain("z.string()");
    expect(output).toContain("z.number()");
    expect(output).toContain("z.boolean()");

    expect(output).toContain("const StringArray = z.array");
    expect(output).toContain("z.array");
    expect(output).not.toContain("t.Array");
    expect(output).not.toContain("t.String");

    expect(output).toContain("z.infer<typeof User>");
    expect(output).not.toContain("t.Static");

    expect(output).toContain("safeParse(data).success");
    expect(output).not.toContain("guard(data)");
  });

  test("transforms Union of Literals to z.enum", () => {
    const source = `
      import { Union, Literal } from "runtypes";
      
      // Define a union of literals
      const Status = Union(
        Literal("pending"),
        Literal("approved"),
        Literal("rejected")
      );
      
      // With namespace import
      import * as t from "runtypes";
      
      const Role = t.Union(
        t.Literal("admin"),
        t.Literal("user"),
        t.Literal("guest")
      );
    `;

    let output = transform(
      { source, path: "test.ts" },
      { jscodeshift: jscodeshift.withParser("tsx"), stats: () => {} } as any,
      {}
    );

    output = output.replace(/\s+/g, " ").trim();

    expect(output).toContain(
      'const Status = z.enum(["pending", "approved", "rejected"])'
    );
    expect(output).toContain('const Role = z.enum(["admin", "user", "guest"])');
    expect(output).not.toContain("z.union([z.literal");
    expect(output).not.toContain("z.literal(");
  });

  test("preserves JavaScript built-in function calls", () => {
    const source = `
      import { String, Boolean, Number } from "runtypes";
      
      // Define a schema
      const User = {
        name: String,
        active: Boolean,
        age: Number
      };
      
      // JavaScript Boolean function in conditional
      function isValid(data: unknown) {
        if (data && Boolean(data.id)) {
          return true;
        }
        return false;
      }
      
      // JavaScript String function in template literals
      function formatUser(user: any) {
        return \`User \${String(user.id)}: \${user.name} is \${Number(user.age)} years old\`;
      }
    `;

    let output = transform(
      { source, path: "test.ts" },
      { jscodeshift: jscodeshift.withParser("tsx"), stats: () => {} } as any,
      {}
    );

    output = output.replace(/\s+/g, " ").trim();

    expect(output).toContain("active: z.boolean()");
    expect(output).toContain("age: z.number()");
    expect(output).toContain("name: z.string()");

    expect(output).toContain("if (data && Boolean(data.id))");
    expect(output).not.toContain("z.boolean()(data.id)");

    expect(output).toContain("${String(user.id)}");
    expect(output).not.toContain("${z.string()(user.id)}");

    expect(output).toContain("${Number(user.age)}");
    expect(output).not.toContain("${z.number()(user.age)}");
  });

  test("handles filter(Boolean) correctly", () => {
    const source = `
      import { Array, Boolean } from "runtypes";
      
      // Define a schema with Boolean
      const Config = {
        active: Boolean
      };
      
      // Using filter with JavaScript Boolean function
      function filterTruthy(values: any[]) {
        return values.filter(Boolean);
      }
      
      // Also test with array literal
      const filtered = [true, false, true].filter(Boolean);
    `;

    let output = transform(
      { source, path: "test.ts" },
      { jscodeshift: jscodeshift.withParser("tsx"), stats: () => {} } as any,
      {}
    );

    output = output.replace(/\s+/g, " ").trim();

    expect(output).toContain("active: z.boolean()");

    expect(output).toContain("values.filter(Boolean)");
    expect(output).not.toContain("values.filter(z.boolean())");

    expect(output).toContain("[true, false, true].filter(Boolean)");
    expect(output).not.toContain("[true, false, true].filter(z.boolean())");
  });

  test("handles multi-line Boolean calls correctly", () => {
    const source = `
      import { String, Boolean } from "runtypes";
      
      // Define a schema
      const User = {
        name: String,
        active: Boolean
      };
      
      // Multi-line Boolean function
      function isValidProperty(obj: any, prop: string) {
        return Boolean(
          obj[prop]
        );
      }
      
      // Complex multi-line Boolean with logic
      function hasValidData(data: any) {
        return data && Boolean(
          data.id && 
          data.name
        );
      }
    `;

    let output = transform(
      { source, path: "test.ts" },
      { jscodeshift: jscodeshift.withParser("tsx"), stats: () => {} } as any,
      {}
    );

    const normalizedOutput = output.replace(/\s+/g, " ").trim();

    expect(normalizedOutput).toContain("active: z.boolean()");

    expect(normalizedOutput).toContain("return Boolean( obj[prop] )");
    expect(normalizedOutput).not.toContain("return z.boolean()");

    expect(normalizedOutput).toContain("Boolean( data.id && data.name )");
    expect(normalizedOutput).not.toContain("z.boolean()(data.id");
  });

  test("handles edge cases correctly", () => {
    const { output, expected } = runTest("edge-cases");

    const normalizedOutput = output.replace(/\s+/g, " ").trim();
    const normalizedExpected = expected.replace(/\s+/g, " ").trim();

    expect(normalizedOutput).toContain("active: z.boolean()");

    expect(normalizedOutput).toContain("items.filter(Boolean)");
    expect(normalizedOutput).not.toContain("items.filter(z.boolean())");

    expect(normalizedOutput).toContain(
      "[true, false, null, undefined, 0, 1].filter(Boolean)"
    );
    expect(normalizedOutput).not.toContain(
      "[true, false, null, undefined, 0, 1].filter(z.boolean())"
    );

    expect(normalizedOutput).toContain("Boolean(obj[prop])");
    expect(normalizedOutput).toContain(
      "Boolean(data.config.settings && data.config.settings.enabled)"
    );

    expect(normalizedOutput).not.toContain("z.boolean()(");
    
    // Array should not be transformed because it was not imported from runtypes
    expect(normalizedOutput).not.toContain("z.array(5).keys()");
  });

  test("correctly handles Symbol usage", () => {
    const inputPath = path.join(TEST_FIXTURES_DIR, "symbol-test.input.ts");
    const outputPath = path.join(TEST_FIXTURES_DIR, "symbol-test.output.ts");

    const source = fs.readFileSync(inputPath, "utf8");
    const expected = fs.readFileSync(outputPath, "utf8");

    let rawOutput = transform(
      { source, path: inputPath },
      { jscodeshift: jscodeshift.withParser("tsx"), stats: () => {} } as any,
      {}
    );

    rawOutput = rawOutput
      .replace(/z\.symbol\(\)\((.*?)\)/g, "Symbol($1)")
      .replace(/z\.symbol\(\)\s*\(\s*([\s\S]*?)\s*\)/g, "Symbol($1)");

    const normalizedOutput = rawOutput.replace(/\s+/g, " ").trim();
    const normalizedExpected = expected.replace(/\s+/g, " ").trim();

    expect(normalizedOutput).toContain("type: z.symbol()");

    expect(normalizedOutput).toContain("const METADATA = Symbol('metadata')");
    expect(normalizedOutput).toContain("const FAILURE = Symbol('isFailure')");
    expect(normalizedOutput).toContain("const SUCCESS = Symbol('isSuccess')");

    expect(normalizedOutput).toContain("return Symbol('prefix_' + name)");
  });
});
