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
  Template: "z.string",
  Symbol: "z.symbol",
  Constraint: "",
  Brand: "",
};

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
  strict: "",
  passthrough: "",
  or: "",
};

function transformer(file: FileInfo, api: API, options: Options) {
  const j = api.jscodeshift.withParser("tsx");
  const root = j(file.source);

  // we need to track the imported runtypes that clash with JS builtins
  const importedRuntypesBuiltins = new Set<string>();

  let hasModifications = false;
  let needsZodImport = false;
  let namespacePrefix: string | null = null;
  let symbolAlias: string | null = null;

  /**
   * Parses a zod expression string and returns the corresponding AST node
   */
  function parseZodExpression(expr: string) {
    if (expr.includes("(")) {
      const [name, args] = expr.split("(");
      if (name === "z.array" || name === "z.lazy" || name === "z.instanceof") {
        return j.memberExpression(
          j.identifier("z"),
          j.identifier(name.substring(2))
        );
      } else {
        return j.callExpression(
          j.memberExpression(
            j.identifier("z"),
            j.identifier(name.substring(2))
          ),
          []
        );
      }
    } else {
      return j.memberExpression(
        j.identifier("z"),
        j.identifier(expr.substring(2))
      );
    }
  }

  /**
   * Processes import declarations related to runtypes
   */
  function processImports() {
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

        if (path.node.specifiers) {
          path.node.specifiers.forEach((specifier) => {
            if (j.ImportSpecifier.check(specifier)) {
              if (j.Identifier.check(specifier.imported)) {
                // track builtins like Array, String, Number to see if they were imported via runtypes
                importedRuntypesBuiltins.add(specifier.imported.name);
              }
            }
          });
        }

        if (path.node.specifiers) {
          path.node.specifiers.forEach((specifier) => {
            if (j.ImportNamespaceSpecifier.check(specifier)) {
              namespacePrefix = (specifier.local as Identifier).name;
            } else if (j.ImportSpecifier.check(specifier)) {
              if (
                j.Identifier.check(specifier.imported) &&
                j.Identifier.check(specifier.local) &&
                specifier.imported.name === "Symbol"
              ) {
                symbolAlias = specifier.local.name;
              }
            }
          });
        }

        j(path).remove();
      });
  }

  /**
   * Marks JavaScript builtin functions to avoid transforming them
   */
  function markJsBuiltins() {
    root
      .find(j.CallExpression)
      .filter((path) => {
        return (
          j.Identifier.check(path.node.callee) &&
          ["Boolean", "String", "Number", "Symbol"].includes(
            path.node.callee.name
          )
        );
      })
      .forEach((path) => {
        (path.node.callee as any).__jsBuiltin = true;
      });

    root
      .find(j.Identifier)
      .filter((path) => {
        return (
          ["Boolean", "String", "Number", "Symbol"].includes(path.node.name) &&
          ((j.CallExpression.check(path.parent.node) &&
            path.parent.node.arguments.includes(path.node)) ||
            (j.MemberExpression.check(path.parent.node) &&
              path.parent.node.property === path.node))
        );
      })
      .forEach((path) => {
        (path.node as any).__jsBuiltin = true;
      });
  }

  /**
   * Transforms standalone type identifiers to their zod equivalents
   */
  function transformStandaloneTypeIdentifiers() {
    root
      .find(j.Identifier)
      .filter((path: ASTPath<Identifier>) => {
        return (
          Object.keys(typeMapping).includes(path.node.name) ||
          (symbolAlias !== null && path.node.name === symbolAlias)
        );
      })
      .forEach((path: ASTPath<Identifier>) => {
        if (shouldSkipIdentifier(path)) return;

        const typeName = path.node.name;
        replaceWithZodType(path, typeName);
      });
  }

  /**
   * Determines if an identifier should be skipped during transformation
   */
  function shouldSkipIdentifier(path: ASTPath<Identifier>) {
    const typeName = path.node.name;
    
    // Skip import specifiers
    if (j.ImportSpecifier.check(path.parent.node)) {
      return true;
    }

    // Skip if this is the object part of a member expression (e.g., String.prototype)
    if (
      j.MemberExpression.check(path.parent.node) &&
      path.parent.node.object === path.node
    ) {
      return true;
    }

    // Skip if already marked as JS builtin
    if ((path.node as any).__jsBuiltin) {
      return true;
    }

    // Skip if this is a function call with built-in name (Boolean(), String(), etc.)
    // This covers JavaScript builtin function calls like Boolean(value)
    if (
      j.CallExpression.check(path.parent.node) &&
      path.parent.node.callee === path.node &&
      ["Boolean", "String", "Number", "Symbol"].includes(typeName)
    ) {
      return true;
    }

    // For namespace imports, check if this is used as a standalone builtin
    if (namespacePrefix && ["Boolean", "String", "Number", "Symbol"].includes(typeName)) {
      // Skip if it's NOT prefixed with the namespace (e.g., Boolean vs t.Boolean)
      const parent = path.parent;
      if (
        !j.MemberExpression.check(parent.node) ||
        parent.node.property !== path.node ||
        !j.Identifier.check(parent.node.object) ||
        parent.node.object.name !== namespacePrefix
      ) {
        return true; // This is a standalone Boolean/String/etc, not t.Boolean
      }
    }

    // For non-namespace imports, skip if this builtin was NOT imported from runtypes
    if (
      !namespacePrefix &&
      ["Boolean", "String", "Number", "Symbol"].includes(typeName) &&
      !importedRuntypesBuiltins.has(typeName)
    ) {
      return true;
    }

    // Skip filter function arguments that are built-ins
    if (
      j.CallExpression.check(path.parent.node) &&
      j.MemberExpression.check(path.parent.node.callee) &&
      j.Identifier.check(path.parent.node.callee.property) &&
      path.parent.node.callee.property.name === "filter" &&
      path.parent.node.arguments.includes(path.node) &&
      ["Boolean", "String", "Number", "Symbol"].includes(typeName)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Replaces an identifier with its corresponding zod type
   */
  function replaceWithZodType(path: ASTPath<Identifier>, typeName: string) {
    // Additional check: if this is a function call, it should stay as JS builtin
    if (
      j.CallExpression.check(path.parent.node) &&
      path.parent.node.callee === path.node
    ) {
      return; // Don't transform function calls like Boolean(value)
    }

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
    } else if (symbolAlias !== null && typeName === symbolAlias) {
      j(path).replaceWith(
        j.callExpression(
          j.memberExpression(j.identifier("z"), j.identifier("symbol")),
          []
        )
      );
      hasModifications = true;
    }
  }

  /**
   * Transforms type call expressions to their zod equivalents
   */
  function transformTypeCallExpressions() {
    root
      .find(j.CallExpression)
      .filter((path: ASTPath<CallExpression>) => {
        const callee = path.node.callee;
        if (j.Identifier.check(callee)) {
          const typeName = callee.name;
          
          // Skip if this is a JavaScript builtin function call
          if (
            ["Boolean", "String", "Number", "Symbol"].includes(typeName) &&
            ((callee as any).__jsBuiltin ||
             !importedRuntypesBuiltins.has(typeName) ||
             // For imported runtypes builtins used as function calls, still skip
             path.node.arguments.length > 0)
          ) {
            return false;
          }
          
          return Object.keys(typeMapping).includes(typeName);
        }
        return false;
      })
      .forEach((path: ASTPath<CallExpression>) => {
        hasModifications = true;
        const callee = path.node.callee as Identifier;
        const mappedType = typeMapping[callee.name];

        if (!mappedType) return;

        if (callee.name === "Object") {
          transformObjectCall(path);
        } else if (callee.name === "Array") {
          transformArrayCall(path);
        } else if (callee.name === "Optional") {
          transformOptionalCall(path);
        } else if (callee.name === "Union") {
          transformUnionCall(path);
        } else if (callee.name === "Tuple") {
          transformTupleCall(path);
        } else if (callee.name === "Intersect") {
          transformIntersectCall(path);
        } else {
          path.node.callee = parseZodExpression(mappedType);
        }
      });
  }

  /**
   * Transforms Object call expressions
   */
  function transformObjectCall(path: ASTPath<CallExpression>) {
    if (
      path.node.arguments.length > 0 &&
      j.ObjectExpression.check(path.node.arguments[0])
    ) {
      const objExpr = path.node.arguments[0] as ObjectExpression;
      objExpr.properties.forEach((prop) => {
        if (j.Property.check(prop) && j.Identifier.check(prop.value)) {
          const typeName = (prop.value as Identifier).name;
          if (typeMapping[typeName]) {
            if (typeName === "String") {
              prop.value = j.callExpression(
                j.memberExpression(j.identifier("z"), j.identifier("string")),
                []
              );
            } else if (typeName === "Number") {
              prop.value = j.callExpression(
                j.memberExpression(j.identifier("z"), j.identifier("number")),
                []
              );
            } else if (typeName === "Boolean") {
              prop.value = j.callExpression(
                j.memberExpression(j.identifier("z"), j.identifier("boolean")),
                []
              );
            } else {
              prop.value = parseZodExpression(typeMapping[typeName]);
            }
          }
        }
      });
    }
    path.node.callee = parseZodExpression(typeMapping["Object"]);
  }

  /**
   * Transforms Array call expressions
   */
  function transformArrayCall(path: ASTPath<CallExpression>) {
    if (!importedRuntypesBuiltins.has("Array")) return;

    if (
      path.node.arguments.length > 0 &&
      j.Identifier.check(path.node.arguments[0])
    ) {
      const innerType = (path.node.arguments[0] as Identifier).name;
      if (typeMapping[innerType]) {
        path.node.arguments[0] = parseZodExpression(typeMapping[innerType]);
      }
    }
    path.node.callee = parseZodExpression(typeMapping["Array"]);
  }

  /**
   * Transforms Optional call expressions
   */
  function transformOptionalCall(path: ASTPath<CallExpression>) {
    if (
      path.node.arguments.length > 0 &&
      j.Identifier.check(path.node.arguments[0])
    ) {
      const innerType = (path.node.arguments[0] as Identifier).name;
      if (typeMapping[innerType]) {
        j(path).replaceWith(
          j.callExpression(
            j.memberExpression(
              parseZodExpression(typeMapping[innerType]),
              j.identifier("optional")
            ),
            []
          )
        );
      }
    }
  }

  /**
   * Transforms Union call expressions, handling enum cases specially
   */
  function transformUnionCall(path: ASTPath<CallExpression>) {
    const allLiterals = path.node.arguments.every(
      (arg) =>
        j.CallExpression.check(arg) &&
        j.Identifier.check(arg.callee) &&
        arg.callee.name === "Literal"
    );

    if (allLiterals) {
      const literalValues = path.node.arguments.map((arg) => {
        return (arg as CallExpression).arguments[0];
      });

      j(path).replaceWith(
        j.callExpression(
          j.memberExpression(j.identifier("z"), j.identifier("enum")),
          [j.arrayExpression(literalValues)]
        )
      );
      return;
    }

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
  }

  /**
   * Transforms Tuple call expressions
   */
  function transformTupleCall(path: ASTPath<CallExpression>) {
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
  }

  /**
   * Transforms Intersect call expressions
   */
  function transformIntersectCall(path: ASTPath<CallExpression>) {
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
  }

  /**
   * Transforms runtypes method calls to their zod equivalents
   */
  function transformMethodCalls() {
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
          if (methodName === "or") {
            transformOrMethod(path, callee);
          }
          return;
        }

        (callee.property as Identifier).name = mappedMethod;
        hasModifications = true;

        if (methodName === "withConstraint") {
          transformWithConstraintMethod(path);
        } else if (methodName === "pick" || methodName === "omit") {
          transformPickOmitMethod(path, methodName);
        } else if (methodName === "strict") {
          transformStrictMethod(path, callee);
        } else if (methodName === "passthrough") {
          transformPassthroughMethod(path, callee);
        }
      });
  }

  /**
   * Transforms .or() method calls to z.union
   */
  function transformOrMethod(
    path: ASTPath<CallExpression>,
    callee: MemberExpression
  ) {
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

  /**
   * Transforms withConstraint method calls to zod's refine
   */
  function transformWithConstraintMethod(path: ASTPath<CallExpression>) {
    if (path.node.arguments.length > 0) {
      const arg = path.node.arguments[0];

      if (
        j.ArrowFunctionExpression.check(arg) &&
        j.LogicalExpression.check(arg.body) &&
        arg.body.operator === "||" &&
        (j.StringLiteral.check(arg.body.right) ||
          j.Literal.check(arg.body.right))
      ) {
        const test = arg.body.left;
        const message = arg.body.right;
        const newArrow = j.arrowFunctionExpression(arg.params, test);
        path.node.arguments = [newArrow, message];
      }
    }
  }

  /**
   * Transforms pick/omit method calls
   */
  function transformPickOmitMethod(
    path: ASTPath<CallExpression>,
    methodName: string
  ) {
    const args = path.node.arguments;
    if (
      args.length > 0 &&
      args.every((arg) => j.StringLiteral.check(arg) || j.Literal.check(arg))
    ) {
      const properties = args.map((arg) => {
        const key = j.StringLiteral.check(arg)
          ? (arg as any).value
          : (arg as any).value;

        return j.property("init", j.identifier(key), j.literal(true));
      });

      path.node.arguments = [j.objectExpression(properties)];
    }
  }

  /**
   * Transforms .strict() method calls to z.strictObject()
   */
  function transformStrictMethod(
    path: ASTPath<CallExpression>,
    callee: MemberExpression
  ) {
    const object = callee.object;
    j(path).replaceWith(
      j.callExpression(
        j.memberExpression(j.identifier("z"), j.identifier("strictObject")),
        [object]
      )
    );
    hasModifications = true;
  }

  /**
   * Transforms .passthrough() method calls to z.looseObject()
   */
  function transformPassthroughMethod(
    path: ASTPath<CallExpression>,
    callee: MemberExpression
  ) {
    const object = callee.object;
    j(path).replaceWith(
      j.callExpression(
        j.memberExpression(j.identifier("z"), j.identifier("looseObject")),
        [object]
      )
    );
    hasModifications = true;
  }

  /**
   * Transforms Static type references to z.infer
   */
  function transformStaticToInfer() {
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
  }

  /**
   * Transforms namespace imports (e.g., t.String)
   */
  function transformNamespaceImports() {
    if (!namespacePrefix) return;

    transformNamespaceCallExpressions();
    transformNamespaceMethodCalls(); // Run before member expressions
    transformNamespaceMemberExpressions();
    transformNamespaceStaticTypes();
  }

  /**
   * Transforms namespace call expressions (e.g., t.Array(t.String))
   */
  function transformNamespaceCallExpressions() {
    root
      .find(j.CallExpression)
      .filter((path: ASTPath<CallExpression>) => {
        return (
          j.MemberExpression.check(path.node.callee) &&
          j.Identifier.check(path.node.callee.object) &&
          (path.node.callee.object as Identifier).name === namespacePrefix &&
          j.Identifier.check(path.node.callee.property) &&
          Object.keys(typeMapping).includes(
            (path.node.callee.property as Identifier).name
          )
        );
      })
      .forEach((path: ASTPath<CallExpression>) => {
        const callee = path.node.callee as MemberExpression;
        const typeName = (callee.property as Identifier).name;
        const mappedType = typeMapping[typeName];

        if (!mappedType) return;

        if (
          (typeName === "Array" ||
            typeName === "Object" ||
            typeName === "Union") &&
          path.node.arguments.length > 0
        ) {
          if (typeName === "Array") {
            transformNamespaceArrayCall(path);
          } else if (typeName === "Object") {
            transformNamespaceObjectCall(path);
          } else if (typeName === "Union") {
            transformNamespaceUnionCall(path);
          }
        } else if (mappedType.includes("(")) {
          j(path).replaceWith(parseZodExpression(mappedType));
        } else {
          path.node.callee = parseZodExpression(mappedType);
        }
        hasModifications = true;
      });
  }

  /**
   * Transforms namespace array calls (e.g., t.Array(t.String))
   */
  function transformNamespaceArrayCall(path: ASTPath<CallExpression>) {
    const arg = path.node.arguments[0];
    let argNode = null;

    if (
      j.MemberExpression.check(arg) &&
      j.Identifier.check(arg.object) &&
      (arg.object as Identifier).name === namespacePrefix &&
      j.Identifier.check(arg.property)
    ) {
      const argTypeName = (arg.property as Identifier).name;
      const argMappedType = typeMapping[argTypeName];

      if (argMappedType) {
        argNode = parseZodExpression(argMappedType);
      }
    }

    j(path).replaceWith(
      j.callExpression(
        j.memberExpression(j.identifier("z"), j.identifier("array")),
        argNode ? [argNode] : [arg]
      )
    );
  }

  /**
   * Transforms namespace object calls (e.g., t.Object({ name: t.String }))
   */
  function transformNamespaceObjectCall(path: ASTPath<CallExpression>) {
    const arg = path.node.arguments[0];

    if (j.ObjectExpression.check(arg)) {
      arg.properties.forEach((prop) => {
        if (
          j.Property.check(prop) &&
          j.MemberExpression.check(prop.value) &&
          j.Identifier.check(prop.value.object) &&
          (prop.value.object as Identifier).name === namespacePrefix &&
          j.Identifier.check(prop.value.property)
        ) {
          const propTypeName = (prop.value.property as Identifier).name;
          const propMappedType = typeMapping[propTypeName];

          if (propMappedType) {
            prop.value = parseZodExpression(propMappedType);
          }
        }
      });
    }

    j(path).replaceWith(
      j.callExpression(
        j.memberExpression(j.identifier("z"), j.identifier("object")),
        [arg]
      )
    );
  }

  /**
   * Transforms namespace union calls, handling enum cases specially
   */
  function transformNamespaceUnionCall(path: ASTPath<CallExpression>) {
    const allLiterals = path.node.arguments.every(
      (arg) =>
        j.CallExpression.check(arg) &&
        j.MemberExpression.check(arg.callee) &&
        j.Identifier.check(arg.callee.object) &&
        (arg.callee.object as Identifier).name === namespacePrefix &&
        j.Identifier.check(arg.callee.property) &&
        (arg.callee.property as Identifier).name === "Literal"
    );

    if (allLiterals) {
      const literalValues = path.node.arguments.map((arg) => {
        return (arg as CallExpression).arguments[0];
      });

      j(path).replaceWith(
        j.callExpression(
          j.memberExpression(j.identifier("z"), j.identifier("enum")),
          [j.arrayExpression(literalValues)]
        )
      );
    } else {
      j(path).replaceWith(
        j.callExpression(
          j.memberExpression(j.identifier("z"), j.identifier("union")),
          [j.arrayExpression(path.node.arguments)]
        )
      );
    }
  }

  /**
   * Transforms namespace member expressions (e.g., t.String)
   */
  function transformNamespaceMemberExpressions() {
    root
      .find(j.MemberExpression)
      .filter((path: ASTPath<MemberExpression>) => {
        return (
          j.Identifier.check(path.node.object) &&
          (path.node.object as Identifier).name === namespacePrefix &&
          j.Identifier.check(path.node.property) &&
          Object.keys(typeMapping).includes(
            (path.node.property as Identifier).name
          )
        );
      })
      .forEach((path: ASTPath<MemberExpression>) => {
        const typeName = (path.node.property as Identifier).name;
        const mappedType = typeMapping[typeName];

        if (!mappedType) return;

        const isArgToCallExpr =
          j.CallExpression.check(path.parent.node) &&
          path.parent.node.arguments.includes(path.node);

        if (
          [
            "String",
            "Number",
            "Boolean",
            "Null",
            "Undefined",
            "Unknown",
            "Void",
            "Never",
          ].includes(typeName)
        ) {
          j(path).replaceWith(parseZodExpression(mappedType));
          hasModifications = true;
        } else if (
          isArgToCallExpr ||
          [
            "Array",
            "Tuple",
            "Record",
            "Object",
            "Union",
            "Intersect",
            "Optional",
            "Literal",
          ].includes(typeName)
        ) {
          path.node.object = j.identifier("z");
          if (typeName === "Object" || typeName === "Record") {
            path.node.property = j.identifier("object");
          } else if (typeName === "Intersect") {
            path.node.property = j.identifier("intersection");
          } else {
            path.node.property = j.identifier(typeName.toLowerCase());
          }
          hasModifications = true;
        }
      });
  }

  /**
   * Transforms namespace static types (e.g., t.Static<typeof X>)
   */
  function transformNamespaceStaticTypes() {
    root.find(j.TSTypeReference).forEach((path: ASTPath<TSTypeReference>) => {
      if (
        j.TSQualifiedName.check(path.node.typeName) &&
        j.Identifier.check(path.node.typeName.left) &&
        path.node.typeName.left.name === namespacePrefix &&
        j.Identifier.check(path.node.typeName.right) &&
        path.node.typeName.right.name === "Static"
      ) {
        hasModifications = true;
        path.node.typeName = j.tsQualifiedName(
          j.identifier("z"),
          j.identifier("infer")
        );
      }
    });
  }

  /**
   * Transforms namespace method calls (e.g., t.String.guard())
   */
  function transformNamespaceMethodCalls() {
    root
      .find(j.MemberExpression)
      .filter((path: ASTPath<MemberExpression>) => {
        return (
          j.MemberExpression.check(path.node.object) &&
          j.Identifier.check(path.node.object.object) &&
          (path.node.object.object as Identifier).name === namespacePrefix &&
          j.Identifier.check(path.node.object.property) &&
          Object.keys(typeMapping).includes(
            (path.node.object.property as Identifier).name
          ) &&
          j.Identifier.check(path.node.property) &&
          ["check", "guard", "parse", "safeParse"].includes(
            (path.node.property as Identifier).name
          )
        );
      })
      .forEach((path: ASTPath<MemberExpression>) => {
        const objectExpr = path.node.object as MemberExpression;
        const typeName = (objectExpr.property as Identifier).name;
        const methodName = (path.node.property as Identifier).name;

        const isInIfCondition =
          methodName === "guard" &&
          path.parent &&
          j.CallExpression.check(path.parent.node) &&
          path.parent.parent &&
          j.IfStatement.check(path.parent.parent.node) &&
          path.parent.parent.node.test === path.parent.node;

        if (
          [
            "String",
            "Number",
            "Boolean",
            "Null",
            "Undefined",
            "Unknown",
            "Void",
            "Never",
          ].includes(typeName)
        ) {
          const mappedType = typeMapping[typeName];
          if (mappedType) {
            let newMethod = methodName;
            if (methodName === "guard") {
              newMethod = "safeParse";
            } else if (methodName === "check") {
              newMethod = "parse";
            }
            // If methodName is "safeParse", keep it as "safeParse"

            const baseExpr = j.memberExpression(
              parseZodExpression(mappedType),
              j.identifier(newMethod)
            );

            if (methodName === "guard" || methodName === "safeParse") {
              // Add .success for guard methods and safeParse that came from guard
              const callExpr = path.parent?.node as CallExpression;
              if (callExpr && j.CallExpression.check(callExpr)) {
                j(path.parent).replaceWith(
                  j.memberExpression(
                    j.callExpression(baseExpr, callExpr.arguments),
                    j.identifier("success")
                  )
                );
              }
            } else {
              j(path).replaceWith(baseExpr);
            }

            hasModifications = true;
          }
        }
      });
  }

  /**
   * Transforms validation methods (check, guard, parse)
   */
  function transformValidationMethods() {
    root
      .find(j.MemberExpression)
      .filter((path: ASTPath<MemberExpression>) => {
        return (
          j.Identifier.check(path.node.property) &&
          ["check", "guard", "parse"].includes(
            (path.node.property as Identifier).name
          ) &&
          // Skip if this is a namespace-prefixed call that should be handled by transformNamespaceMethodCalls
          (!namespacePrefix ||
            !j.MemberExpression.check(path.node.object) ||
            !j.Identifier.check(path.node.object.object) ||
            (path.node.object.object as Identifier).name !== namespacePrefix) &&
          // Skip if this is already a zod call (z.type().method)
          !(j.CallExpression.check(path.node.object) &&
            j.MemberExpression.check(path.node.object.callee) &&
            j.Identifier.check(path.node.object.callee.object) &&
            path.node.object.callee.object.name === "z")
        );
      })
      .forEach((path: ASTPath<MemberExpression>) => {
        const methodName = (path.node.property as Identifier).name;

        if (methodName === "check" || methodName === "parse") {
          (path.node.property as Identifier).name = "parse";
          hasModifications = true;
        } else if (methodName === "guard") {
          (path.node.property as Identifier).name = "safeParse";
          transformGuardToSafeParse(path);
          hasModifications = true;
        } else if (methodName === "safeParse") {
          // Handle cases where guard was already transformed to safeParse but needs .success
          if (
            j.CallExpression.check(path.node.object) &&
            j.MemberExpression.check(path.node.object.callee) &&
            j.Identifier.check(path.node.object.callee.object) &&
            path.node.object.callee.object.name === "z"
          ) {
            // This is a z.type().safeParse() call that should have .success
            const parent = path.parent;
            if (parent && j.CallExpression.check(parent.node)) {
              const callExpr = parent.node as CallExpression;
              j(parent).replaceWith(
                j.memberExpression(
                  j.callExpression(
                    j.memberExpression(path.node.object, j.identifier("safeParse")),
                    callExpr.arguments
                  ),
                  j.identifier("success")
                )
              );
              hasModifications = true;
            }
          }
        }
      });
  }

  /**
   * Transforms guard method calls to safeParse().success
   */
  function transformGuardToSafeParse(path: ASTPath<MemberExpression>) {
    const parent = path.parent;
    if (parent && j.CallExpression.check(parent.node) && parent.parent) {
      const callExpr = parent.node as CallExpression;

      // Check if this is used in an if condition
      if (
        j.IfStatement.check(parent.parent.node) &&
        (parent.parent.node as IfStatement).test === callExpr
      ) {
        j(parent).replaceWith(
          j.memberExpression(
            j.callExpression(
              j.memberExpression(path.node.object, j.identifier("safeParse")),
              callExpr.arguments
            ),
            j.identifier("success")
          )
        );
      } else {
        // For other contexts, still transform but let user handle the result
        j(parent).replaceWith(
          j.memberExpression(
            j.callExpression(
              j.memberExpression(path.node.object, j.identifier("safeParse")),
              callExpr.arguments
            ),
            j.identifier("success")
          )
        );
      }
    }
  }

  /**
   * Adds zod import if required
   */
  function addZodImport() {
    if (needsZodImport) {
      const zodImport = j.importDeclaration(
        [j.importSpecifier(j.identifier("z"))],
        j.literal("zod/v4")
      );

      root.get().node.program.body.unshift(zodImport);
    }
  }


  processImports();
  markJsBuiltins();
  transformStandaloneTypeIdentifiers();
  transformTypeCallExpressions();
  transformMethodCalls();
  transformStaticToInfer();
  transformNamespaceImports();
  transformValidationMethods();
  addZodImport();

  return hasModifications ? root.toSource() : file.source;
}

export default transformer;
