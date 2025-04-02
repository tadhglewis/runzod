import { API, FileInfo, Options } from "jscodeshift";

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
  const j = api.jscodeshift;
  const root = j(file.source);
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

  // Replace type usages
  // Object creation
  root
    .find(j.CallExpression)
    .filter((path) => {
      const callee = path.node.callee;
      if (j.Identifier.check(callee)) {
        return Object.keys(typeMapping).includes(callee.name);
      }
      return false;
    })
    .forEach((path) => {
      hasModifications = true;
      const callee = path.node.callee as j.Identifier;
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
          const objExpr = path.node.arguments[0] as j.ObjectExpression;
          objExpr.properties.forEach((prop) => {
            if (j.Property.check(prop) && j.Identifier.check(prop.value)) {
              const typeName = (prop.value as j.Identifier).name;
              if (typeMapping[typeName]) {
                prop.value = j.parseExpression(typeMapping[typeName]);
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
          const innerType = (path.node.arguments[0] as j.Identifier).name;
          if (typeMapping[innerType]) {
            path.node.arguments[0] = j.parseExpression(typeMapping[innerType]);
          }
        }
      } else if (callee.name === "Optional") {
        // Optional(String) -> z.string().optional()
        if (
          path.node.arguments.length > 0 &&
          j.Identifier.check(path.node.arguments[0])
        ) {
          const innerType = (path.node.arguments[0] as j.Identifier).name;
          if (typeMapping[innerType]) {
            // Replace with innerType.optional()
            j(path).replaceWith(
              j.callExpression(
                j.memberExpression(
                  j.parseExpression(typeMapping[innerType]),
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
              ? j.parseExpression(typeMapping[typeName])
              : arg;
          }
          return arg;
        });

        j(path).replaceWith(
          j.callExpression(j.parseExpression("z.union"), [
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
              ? j.parseExpression(typeMapping[typeName])
              : arg;
          }
          return arg;
        });

        j(path).replaceWith(
          j.callExpression(j.parseExpression("z.tuple"), [
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
              ? j.parseExpression(typeMapping[typeName])
              : arg;
          }
          return arg;
        });

        j(path).replaceWith(
          j.callExpression(j.parseExpression("z.intersection"), [
            j.arrayExpression(intersectArgs),
          ])
        );
        return;
      }

      // Replace the identifier with the mapped zod type
      path.node.callee = j.parseExpression(mappedType);
    });

  // Replace method calls (withConstraint, withBrand, etc.)
  root
    .find(j.CallExpression)
    .filter((path) => {
      const callee = path.node.callee;
      return (
        j.MemberExpression.check(callee) &&
        j.Identifier.check(callee.property) &&
        Object.keys(methodMapping).includes(callee.property.name)
      );
    })
    .forEach((path) => {
      const callee = path.node.callee as j.MemberExpression;
      const methodName = (callee.property as j.Identifier).name;
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
              j.callExpression(j.parseExpression("z.union"), [
                j.arrayExpression([object, ...args]),
              ])
            );
            hasModifications = true;
          }
        }
        return;
      }

      // Update the method name to the zod equivalent
      (callee.property as j.Identifier).name = mappedMethod;
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
    });

  // Replace Static<typeof X> with z.infer<typeof X>
  root
    .find(j.TSTypeReference)
    .filter((path) => {
      return (
        j.Identifier.check(path.node.typeName) &&
        path.node.typeName.name === "Static"
      );
    })
    .forEach((path) => {
      hasModifications = true;
      (path.node.typeName as j.Identifier).name = "z.infer";
    });

  // Replace validation methods
  root
    .find(j.MemberExpression)
    .filter((path) => {
      return (
        j.Identifier.check(path.node.property) &&
        ["check", "guard", "parse"].includes(path.node.property.name)
      );
    })
    .forEach((path) => {
      const methodName = (path.node.property as j.Identifier).name;

      // Replace with zod equivalents
      if (methodName === "check" || methodName === "parse") {
        (path.node.property as j.Identifier).name = "parse";
        hasModifications = true;
      } else if (methodName === "guard") {
        (path.node.property as j.Identifier).name = "safeParse";

        // Transforming usage: if (Type.guard(data)) { ... }
        // to: if (Type.safeParse(data).success) { ... }
        const parent = path.parent;
        if (parent && j.CallExpression.check(parent.node) && parent.parent) {
          const callExpr = parent.node as j.CallExpression;

          // Inside an if statement condition
          if (
            j.IfStatement.check(parent.parent.node) &&
            parent.parent.node.test === callExpr
          ) {
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
