import {
  API,
  FileInfo,
  Options,
  ASTPath,
  CallExpression,
  IfStatement,
  Identifier,
  MemberExpression,
  ObjectExpression,
  TSTypeReference,
  Node,
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
  const j = api.jscodeshift.withParser("tsx");
  const root = j(file.source);

  // Helper to parse expressions like "z.string()"
  function parseZodExpression(expr: string) {
    if (expr.includes("(")) {
      // For expressions with calls like z.string()
      const [name, args] = expr.split("(");
      if (name === "z.array" || name === "z.lazy" || name === "z.instanceof") {
        // These need arguments
        return j.memberExpression(
          j.identifier("z"),
          j.identifier(name.substring(2))
        );
      } else {
        // These are called without arguments
        return j.callExpression(
          j.memberExpression(
            j.identifier("z"),
            j.identifier(name.substring(2))
          ),
          []
        );
      }
    } else {
      // For expressions without calls
      return j.memberExpression(
        j.identifier("z"),
        j.identifier(expr.substring(2))
      );
    }
  }
  let hasModifications = false;

  // Track imports to add
  let needsZodImport = false;

  // Replace imports
  root
    .find(j.ImportDeclaration)
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
      j(path).remove();
    });

  // Replace standalone type identifiers
  root
    .find(j.Identifier)
    .filter((path: ASTPath<Identifier>) => {
      return Object.keys(typeMapping).includes(path.node.name);
    })
    .forEach((path: ASTPath<Identifier>) => {
      // Don't replace identifiers that are part of import declarations
      if (j.ImportSpecifier.check(path.parent.node)) {
        return;
      }

      // Don't replace identifiers that are part of member expressions
      if (
        j.MemberExpression.check(path.parent.node) &&
        path.parent.node.object === path.node
      ) {
        return;
      }

      // Don't replace the callee part of call expressions
      if (
        j.CallExpression.check(path.parent.node) &&
        path.parent.node.callee === path.node
      ) {
        return;
      }

      // Replace with appropriate zod type
      const typeName = path.node.name;
      if (typeName === "String") {
        j(path).replaceWith(
          j.callExpression(
            j.memberExpression(j.identifier("z"), j.identifier("string")),
            []
          )
        );
        hasModifications = true;
      } else if (typeName === "Number") {
        j(path).replaceWith(
          j.callExpression(
            j.memberExpression(j.identifier("z"), j.identifier("number")),
            []
          )
        );
        hasModifications = true;
      } else if (typeName === "Boolean") {
        j(path).replaceWith(
          j.callExpression(
            j.memberExpression(j.identifier("z"), j.identifier("boolean")),
            []
          )
        );
        hasModifications = true;
      }
    });

  // Replace type usages
  // Object creation
  root
    .find(j.CallExpression)
    .filter((path: ASTPath<CallExpression>) => {
      const callee = path.node.callee;
      if (j.Identifier.check(callee)) {
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
          j.ObjectExpression.check(path.node.arguments[0])
        ) {
          const objExpr = path.node.arguments[0] as ObjectExpression;
          objExpr.properties.forEach((prop) => {
            if (j.Property.check(prop) && j.Identifier.check(prop.value)) {
              const typeName = (prop.value as Identifier).name;
              if (typeMapping[typeName]) {
                // Handle special cases for primitive types
                if (typeName === "String") {
                  prop.value = j.callExpression(
                    j.memberExpression(
                      j.identifier("z"),
                      j.identifier("string")
                    ),
                    []
                  );
                } else if (typeName === "Number") {
                  prop.value = j.callExpression(
                    j.memberExpression(
                      j.identifier("z"),
                      j.identifier("number")
                    ),
                    []
                  );
                } else if (typeName === "Boolean") {
                  prop.value = j.callExpression(
                    j.memberExpression(
                      j.identifier("z"),
                      j.identifier("boolean")
                    ),
                    []
                  );
                } else {
                  prop.value = parseZodExpression(typeMapping[typeName]);
                }
              }
            }
          });
        }
      } else if (callee.name === "Array") {
        // Array(String) -> z.array(z.string())
        if (
          path.node.arguments.length > 0 &&
          j.Identifier.check(path.node.arguments[0])
        ) {
          const innerType = (path.node.arguments[0] as Identifier).name;
          if (typeMapping[innerType]) {
            path.node.arguments[0] = parseZodExpression(typeMapping[innerType]);
          }
        }
      } else if (callee.name === "Optional") {
        // Optional(String) -> z.string().optional()
        if (
          path.node.arguments.length > 0 &&
          j.Identifier.check(path.node.arguments[0])
        ) {
          const innerType = (path.node.arguments[0] as Identifier).name;
          if (typeMapping[innerType]) {
            // Replace with innerType.optional()
            j(path).replaceWith(
              j.callExpression(
                j.memberExpression(
                  parseZodExpression(typeMapping[innerType]),
                  j.identifier("optional")
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
          if (j.Identifier.check(arg)) {
            const typeName = arg.name;
            return typeMapping[typeName]
              ? parseZodExpression(typeMapping[typeName])
              : arg;
          }
          return arg;
        });

        j(path).replaceWith(
          j.callExpression(parseZodExpression("z.union"), [
            j.arrayExpression(unionArgs),
          ])
        );
        return;
      } else if (callee.name === "Tuple") {
        // Tuple(A, B, C) -> z.tuple([A, B, C])
        const tupleArgs = path.node.arguments.map((arg) => {
          if (j.Identifier.check(arg)) {
            const typeName = arg.name;
            return typeMapping[typeName]
              ? parseZodExpression(typeMapping[typeName])
              : arg;
          }
          return arg;
        });

        j(path).replaceWith(
          j.callExpression(parseZodExpression("z.tuple"), [
            j.arrayExpression(tupleArgs),
          ])
        );
        return;
      } else if (callee.name === "Intersect") {
        // Intersect(A, B) -> z.intersection([A, B])
        const intersectArgs = path.node.arguments.map((arg) => {
          if (j.Identifier.check(arg)) {
            const typeName = arg.name;
            return typeMapping[typeName]
              ? parseZodExpression(typeMapping[typeName])
              : arg;
          }
          return arg;
        });

        j(path).replaceWith(
          j.callExpression(parseZodExpression("z.intersection"), [
            j.arrayExpression(intersectArgs),
          ])
        );
        return;
      }

      // Replace the identifier with the mapped zod type
      path.node.callee = parseZodExpression(mappedType);
    });

  // Replace method calls (withConstraint, withBrand, etc.)
  root
    .find(j.CallExpression)
    .filter((path: ASTPath<CallExpression>) => {
      const callee = path.node.callee;
      return (
        j.MemberExpression.check(callee) &&
        j.Identifier.check(callee.property) &&
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
            j(path).replaceWith(
              j.callExpression(parseZodExpression("z.union"), [
                j.arrayExpression([object, ...args]),
              ])
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
            j.ArrowFunctionExpression.check(arg) &&
            j.LogicalExpression.check(arg.body) &&
            arg.body.operator === "||" &&
            (j.StringLiteral.check(arg.body.right) ||
              j.Literal.check(arg.body.right))
          ) {
            // Extract the test and the error message
            const test = arg.body.left;
            const message = arg.body.right;

            // Create new arrow function with just the test
            const newArrow = j.arrowFunctionExpression(arg.params, test);

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
            (arg) => j.StringLiteral.check(arg) || j.Literal.check(arg)
          )
        ) {
          const properties = args.map((arg) => {
            // Get the string value from either StringLiteral or Literal
            const key = j.StringLiteral.check(arg)
              ? (arg as any).value
              : (arg as any).value;

            return j.property("init", j.identifier(key), j.literal(true));
          });

          // Replace arguments with a single object expression
          path.node.arguments = [j.objectExpression(properties)];
        }
      }
    });

  // Replace Static<typeof X> with z.infer<typeof X>
  root
    .find(j.TSTypeReference)
    .filter((path: ASTPath<TSTypeReference>) => {
      return (
        j.Identifier.check(path.node.typeName) &&
        (path.node.typeName as Identifier).name === "Static"
      );
    })
    .forEach((path: ASTPath<TSTypeReference>) => {
      hasModifications = true;
      (path.node.typeName as Identifier).name = "z.infer";
    });

  // Replace validation methods
  root
    .find(j.MemberExpression)
    .filter((path: ASTPath<MemberExpression>) => {
      return (
        j.Identifier.check(path.node.property) &&
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
        if (parent && j.CallExpression.check(parent.node) && parent.parent) {
          const callExpr = parent.node as CallExpression;

          // Inside an if statement condition
          if (
            j.IfStatement.check(parent.parent.node) &&
            (parent.parent.node as IfStatement).test === callExpr
          ) {
            // Instead of directly modifying the tree, replace the entire expression
            j(parent).replaceWith(
              j.memberExpression(
                j.callExpression(
                  j.memberExpression(
                    path.node.object,
                    j.identifier("safeParse")
                  ),
                  callExpr.arguments
                ),
                j.identifier("success")
              )
            );
          }
        }

        hasModifications = true;
      }
    });

  // Add zod import if needed
  if (needsZodImport) {
    const zodImport = j.importDeclaration(
      [j.importNamespaceSpecifier(j.identifier("z"))],
      j.literal("zod")
    );

    root.get().node.program.body.unshift(zodImport);
  }

  return hasModifications ? root.toSource() : file.source;
}

export default transformer;
