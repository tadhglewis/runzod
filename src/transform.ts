import { API, FileInfo, Options } from "jscodeshift";
import * as j from "jscodeshift";
import {
  ASTPath,
  CallExpression,
  IfStatement,
  Identifier,
  MemberExpression,
  ObjectExpression,
  TSTypeReference,
} from "jscodeshift";

// Type mapping from runtypes to zod
const typeMapping: Record<string, string> = {
  String: "z.string()",
  Number: "z.number()",
  Boolean: "z.boolean()",
  BigInt: "z.bigint()",
  Array: "z.array",
  Tuple: "z.tuple",
  // Prior to version v7
  Record: "z.object",
  Object: "z.object",
  Union: "z.union",
  Intersect: "z.intersection",
  Optional: "z.optional",
  Literal: "z.literal",
  Null: "z.null()",
  Undefined: "z.undefined()",
  Unknown: "z.unknown()",
  Void: "z.void()",
  Never: "z.never()",
  Lazy: "z.lazy",
  InstanceOf: "z.instanceof",
  Nullish: "z.nullish",
  Template: "z.string", // No direct equivalent, needs transformation
  Symbol: "z.symbol",
  Constraint: "", // Special handling needed
  Brand: "", // Special handling needed
};

// Method mapping from runtypes methods to zod methods
const methodMapping: Record<string, string> = {
  check: "parse",
  guard: "safeParse",
  parse: "parse",
  withConstraint: "refine",
  withBrand: "brand",
  asReadonly: "readonly",
  optional: "optional",
  nullable: "nullable",
  pick: "pick",
  omit: "omit",
  extend: "extend",
  exact: "strict",
  or: "", // Special handling needed
};

function transformer(file: FileInfo, api: API, options: Options) {
  const jscodeshift = api.jscodeshift;
  const root = jscodeshift(file.source);
  let hasModifications = false;

  // Track imports to add
  let needsZodImport = false;

  // Replace imports
  root
    .find(jscodeshift.ImportDeclaration)
    .filter((path) => {
      const importPath = path.node.source.value as string;
      return (
        importPath.includes("runtypes") || importPath.endsWith("/index.ts")
      );
    })
    .forEach((path) => {
      hasModifications = true;
      needsZodImport = true;

      // Remove runtypes imports and prepare to add zod import
      jscodeshift(path).remove();
    });

  // Replace type usages
  // Object creation
  root
    .find(jscodeshift.CallExpression)
    .filter((path: ASTPath<CallExpression>) => {
      const callee = path.node.callee;
      if (jscodeshift.Identifier.check(callee)) {
        return Object.keys(typeMapping).includes(callee.name);
      }
      return false;
    })
    .forEach((path: ASTPath<CallExpression>) => {
      hasModifications = true;
      const callee = path.node.callee as Identifier;
      const mappedType = typeMapping[callee.name];

      if (!mappedType) {
        // Skip if there's no direct mapping
        return;
      }

      // Handle special cases
      if (callee.name === "Object") {
        // Object({ foo: String, bar: Number }) -> z.object({ foo: z.string(), bar: z.number() })
        if (
          path.node.arguments.length > 0 &&
          jscodeshift.ObjectExpression.check(path.node.arguments[0])
        ) {
          const objExpr = path.node.arguments[0] as ObjectExpression;
          objExpr.properties.forEach((prop) => {
            if (
              jscodeshift.Property.check(prop) &&
              jscodeshift.Identifier.check(prop.value)
            ) {
              const typeName = (prop.value as Identifier).name;
              if (typeMapping[typeName]) {
                prop.value = jscodeshift.parseExpression(typeMapping[typeName]);
              }
            }
          });
        }
      } else if (callee.name === "Array") {
        // Array(String) -> z.array(z.string())
        if (
          path.node.arguments.length > 0 &&
          jscodeshift.Identifier.check(path.node.arguments[0])
        ) {
          const innerType = (path.node.arguments[0] as Identifier).name;
          if (typeMapping[innerType]) {
            path.node.arguments[0] = jscodeshift.parseExpression(
              typeMapping[innerType]
            );
          }
        }
      } else if (callee.name === "Optional") {
        // Optional(String) -> z.string().optional()
        if (
          path.node.arguments.length > 0 &&
          jscodeshift.Identifier.check(path.node.arguments[0])
        ) {
          const innerType = (path.node.arguments[0] as Identifier).name;
          if (typeMapping[innerType]) {
            // Replace with innerType.optional()
            jscodeshift(path).replaceWith(
              jscodeshift.callExpression(
                jscodeshift.memberExpression(
                  jscodeshift.parseExpression(typeMapping[innerType]),
                  jscodeshift.identifier("optional")
                ),
                []
              )
            );
            return;
          }
        }
      } else if (callee.name === "Union") {
        // Union(A, B, C) -> z.union([A, B, C])
        const unionArgs = path.node.arguments.map((arg) => {
          if (jscodeshift.Identifier.check(arg)) {
            const typeName = arg.name;
            return typeMapping[typeName]
              ? jscodeshift.parseExpression(typeMapping[typeName])
              : arg;
          }
          return arg;
        });

        jscodeshift(path).replaceWith(
          jscodeshift.callExpression(jscodeshift.parseExpression("z.union"), [
            jscodeshift.arrayExpression(unionArgs),
          ])
        );
        return;
      } else if (callee.name === "Tuple") {
        // Tuple(A, B, C) -> z.tuple([A, B, C])
        const tupleArgs = path.node.arguments.map((arg) => {
          if (jscodeshift.Identifier.check(arg)) {
            const typeName = arg.name;
            return typeMapping[typeName]
              ? jscodeshift.parseExpression(typeMapping[typeName])
              : arg;
          }
          return arg;
        });

        jscodeshift(path).replaceWith(
          jscodeshift.callExpression(jscodeshift.parseExpression("z.tuple"), [
            jscodeshift.arrayExpression(tupleArgs),
          ])
        );
        return;
      } else if (callee.name === "Intersect") {
        // Intersect(A, B) -> z.intersection([A, B])
        const intersectArgs = path.node.arguments.map((arg) => {
          if (jscodeshift.Identifier.check(arg)) {
            const typeName = arg.name;
            return typeMapping[typeName]
              ? jscodeshift.parseExpression(typeMapping[typeName])
              : arg;
          }
          return arg;
        });

        jscodeshift(path).replaceWith(
          jscodeshift.callExpression(
            jscodeshift.parseExpression("z.intersection"),
            [jscodeshift.arrayExpression(intersectArgs)]
          )
        );
        return;
      }

      // Replace the identifier with the mapped zod type
      path.node.callee = jscodeshift.parseExpression(mappedType);
    });

  // Replace method calls (withConstraint, withBrand, etc.)
  root
    .find(jscodeshift.CallExpression)
    .filter((path: ASTPath<CallExpression>) => {
      const callee = path.node.callee;
      return (
        jscodeshift.MemberExpression.check(callee) &&
        jscodeshift.Identifier.check(callee.property) &&
        Object.keys(methodMapping).includes(
          (callee.property as Identifier).name
        )
      );
    })
    .forEach((path: ASTPath<CallExpression>) => {
      const callee = path.node.callee as MemberExpression;
      const methodName = (callee.property as Identifier).name;
      const mappedMethod = methodMapping[methodName];

      if (!mappedMethod) {
        // Handle special cases
        if (methodName === "or") {
          // Transform .or() to z.union()
          // Type.or(OtherType) -> z.union([Type, OtherType])
          const object = callee.object;
          const args = path.node.arguments;

          if (args.length > 0) {
            jscodeshift(path).replaceWith(
              jscodeshift.callExpression(
                jscodeshift.parseExpression("z.union"),
                [jscodeshift.arrayExpression([object, ...args])]
              )
            );
            hasModifications = true;
          }
        }
        return;
      }

      // Update the method name to the zod equivalent
      (callee.property as Identifier).name = mappedMethod;
      hasModifications = true;

      // Special case for withConstraint -> refine
      if (methodName === "withConstraint") {
        // In zod, refine takes a message as second argument, not as a return value
        // String.withConstraint(s => test(s) || "error") -> z.string().refine(s => test(s), "error")
        if (path.node.arguments.length > 0) {
          const arg = path.node.arguments[0];

          if (
            jscodeshift.ArrowFunctionExpression.check(arg) &&
            jscodeshift.LogicalExpression.check(arg.body) &&
            arg.body.operator === "||" &&
            (jscodeshift.StringLiteral.check(arg.body.right) ||
              jscodeshift.Literal.check(arg.body.right))
          ) {
            // Extract the test and the error message
            const test = arg.body.left;
            const message = arg.body.right;

            // Create new arrow function with just the test
            const newArrow = jscodeshift.arrowFunctionExpression(
              arg.params,
              test
            );

            // Replace arguments with [test, message]
            path.node.arguments = [newArrow, message];
          }
        }
      }

      // Special case for pick/omit
      if (methodName === "pick" || methodName === "omit") {
        // runtypes: pick("a", "b", "c")
        // zod: pick({ a: true, b: true, c: true })
        const args = path.node.arguments;
        if (
          args.length > 0 &&
          args.every(
            (arg) =>
              jscodeshift.StringLiteral.check(arg) ||
              jscodeshift.Literal.check(arg)
          )
        ) {
          const properties = args.map((arg) => {
            // Get the string value from either StringLiteral or Literal
            const key = jscodeshift.StringLiteral.check(arg)
              ? (arg as any).value
              : (arg as any).value;

            return jscodeshift.property(
              "init",
              jscodeshift.identifier(key),
              jscodeshift.literal(true)
            );
          });

          // Replace arguments with a single object expression
          path.node.arguments = [jscodeshift.objectExpression(properties)];
        }
      }
    });

  // Replace Static<typeof X> with z.infer<typeof X>
  root
    .find(jscodeshift.TSTypeReference)
    .filter((path: ASTPath<TSTypeReference>) => {
      return (
        jscodeshift.Identifier.check(path.node.typeName) &&
        (path.node.typeName as Identifier).name === "Static"
      );
    })
    .forEach((path: ASTPath<TSTypeReference>) => {
      hasModifications = true;
      (path.node.typeName as Identifier).name = "z.infer";
    });

  // Replace validation methods
  root
    .find(jscodeshift.MemberExpression)
    .filter((path: ASTPath<MemberExpression>) => {
      return (
        jscodeshift.Identifier.check(path.node.property) &&
        ["check", "guard", "parse"].includes(
          (path.node.property as Identifier).name
        )
      );
    })
    .forEach((path: ASTPath<MemberExpression>) => {
      const methodName = (path.node.property as Identifier).name;

      // Replace with zod equivalents
      if (methodName === "check" || methodName === "parse") {
        (path.node.property as Identifier).name = "parse";
        hasModifications = true;
      } else if (methodName === "guard") {
        (path.node.property as Identifier).name = "safeParse";

        // Transforming usage: if (Type.guard(data)) { ... }
        // to: if (Type.safeParse(data).success) { ... }
        const parent = path.parent;
        if (
          parent &&
          jscodeshift.CallExpression.check(parent.node) &&
          parent.parent
        ) {
          const callExpr = parent.node as CallExpression;

          // Inside an if statement condition
          if (
            jscodeshift.IfStatement.check(parent.parent.node) &&
            (parent.parent.node as IfStatement).test === callExpr
          ) {
            jscodeshift(parent).replaceWith(
              jscodeshift.memberExpression(
                jscodeshift.callExpression(
                  jscodeshift.memberExpression(
                    path.node.object,
                    jscodeshift.identifier("safeParse")
                  ),
                  callExpr.arguments
                ),
                jscodeshift.identifier("success")
              )
            );
          }
        }

        hasModifications = true;
      }
    });

  // Add zod import if needed
  if (needsZodImport) {
    const zodImport = jscodeshift.importDeclaration(
      [jscodeshift.importNamespaceSpecifier(jscodeshift.identifier("z"))],
      jscodeshift.literal("zod")
    );

    root.get().node.program.body.unshift(zodImport);
  }

  return hasModifications ? root.toSource() : file.source;
}

export default transformer;
