import { API, FileInfo, Options, Transform } from "jscodeshift";

/**
 * Transforms runtypes code to zod
 */
const transform: Transform = (file: FileInfo, api: API, options: Options) => {
  const j = api.jscodeshift;
  const root = j(file.source);

  // Track whether the file was modified
  let modified = false;

  // Check if the file imports from runtypes
  const runtypesImports = root.find(j.ImportDeclaration, {
    source: { value: "runtypes" },
  });

  // If no runtypes imports, don't modify
  if (runtypesImports.length === 0) {
    return file.source;
  }

  // Get runtype namespaces if any
  const namespaces: string[] = [];

  // Find namespace imports - e.g., import * as t from 'runtypes'
  root.find(j.ImportNamespaceSpecifier).forEach((path) => {
    if (
      path.parent.value.type === "ImportDeclaration" &&
      path.parent.value.source.value === "runtypes"
    ) {
      if (path.value.local && path.value.local.name) {
        namespaces.push(path.value.local.name as string);
      }
    }
  });

  // Initialize a set to keep track of Runtype identifiers used for JavaScript casts
  const jsCastNodes = new Set<string>();

  // Find JavaScript casts (String(), Number(), Boolean()) that should NOT be transformed
  root
    .find(j.CallExpression, {
      callee: {
        type: "Identifier",
        name: (name: string) => ["String", "Number", "Boolean"].includes(name),
      },
    })
    .forEach((path) => {
      // If the call isn't part of a member expression (like String.withConstraint)
      // and isn't inside an object property (like { name: String })
      if (
        path.parent.value.type !== "MemberExpression" &&
        path.parent.value.type !== "Property"
      ) {
        const calleeName = (path.value.callee as any).name;
        if (calleeName) {
          jsCastNodes.add(calleeName);
        }
      }
    });

  // Transform imports
  modified = transformImports(j, root, namespaces, modified);

  // Transform Runtype.validate() to zodSchema.safeParse()
  modified = transformValidation(j, root, namespaces, modified);

  // Transform Runtype.check() to zodSchema.parse()
  modified = transformCheck(j, root, namespaces, modified);

  // Transform runtypes Static to zod infer
  modified = transformStatic(j, root, namespaces, modified);

  // Transform ValidationError to ZodError
  modified = transformValidationError(j, root, namespaces, modified);

  // Transform runtype assertions to zod schemas
  modified = transformRuntypeToZod(j, root, namespaces, jsCastNodes, modified);

  if (!modified) {
    return file.source;
  }

  return root.toSource(options.printOptions || { quote: "single" });
};

/**
 * Transforms runtypes imports to zod
 */
function transformImports(
  j: any,
  root: any,
  namespaces: string[],
  modified: boolean
): boolean {
  // Transform named imports
  const namedImports = root.find(j.ImportDeclaration, {
    source: { value: "runtypes" },
  });

  if (namedImports.length > 0) {
    namedImports.replaceWith(() => {
      return j.importDeclaration(
        [j.importDefaultSpecifier(j.identifier("z"))],
        j.literal("zod")
      );
    });
    modified = true;
  }

  return modified;
}

/**
 * Transforms .validate() to .safeParse()
 */
function transformValidation(
  j: any,
  root: any,
  namespaces: string[],
  modified: boolean
): boolean {
  // Find .validate() calls
  root
    .find(j.MemberExpression, {
      property: { name: "validate" },
    })
    .forEach((path: any) => {
      // Replace .validate() with .safeParse()
      path.value.property = j.identifier("safeParse");
      modified = true;

      // Find corresponding result.success and result.value patterns
      const parent = path.parent;
      if (parent.value.type === "CallExpression") {
        const resultVarName = getResultVariableName(parent);
        if (resultVarName) {
          // Find result.value references and replace with result.data
          root
            .find(j.MemberExpression, {
              object: { name: resultVarName },
              property: { name: "value" },
            })
            .forEach((resultPath: any) => {
              resultPath.value.property = j.identifier("data");
              modified = true;
            });

          // Find result.message references and replace with result.error
          root
            .find(j.MemberExpression, {
              object: { name: resultVarName },
              property: { name: "message" },
            })
            .forEach((resultPath: any) => {
              resultPath.value.property = j.identifier("error");
              modified = true;
            });
        }
      }
    });

  return modified;
}

/**
 * Transforms .check() to .parse()
 */
function transformCheck(
  j: any,
  root: any,
  namespaces: string[],
  modified: boolean
): boolean {
  // Find .check() calls
  root
    .find(j.MemberExpression, {
      property: { name: "check" },
    })
    .forEach((path: any) => {
      // Replace .check() with .parse()
      path.value.property = j.identifier("parse");
      modified = true;
    });

  return modified;
}

/**
 * Transforms t.Static<> to z.infer<>
 */
function transformStatic(
  j: any,
  root: any,
  namespaces: string[],
  modified: boolean
): boolean {
  // Process direct Static references
  root
    .find(j.TSTypeReference, {
      typeName: {
        type: "TSQualifiedName",
        left: { name: (name: string) => namespaces.includes(name) },
        right: { name: "Static" },
      },
    })
    .forEach((path: any) => {
      path.value.typeName = j.tsQualifiedName(
        j.identifier("z"),
        j.identifier("infer")
      );
      modified = true;
    });

  // Process non-namespaced Static references
  root
    .find(j.TSTypeReference, {
      typeName: { name: "Static" },
    })
    .forEach((path: any) => {
      path.value.typeName = j.tsQualifiedName(
        j.identifier("z"),
        j.identifier("infer")
      );
      modified = true;
    });

  return modified;
}

/**
 * Transforms ValidationError to ZodError
 */
function transformValidationError(
  j: any,
  root: any,
  namespaces: string[],
  modified: boolean
): boolean {
  // Find instanceof ValidationError checks
  namespaces.forEach((namespace) => {
    root
      .find(j.BinaryExpression, {
        operator: "instanceof",
        right: {
          type: "MemberExpression",
          object: { name: namespace },
          property: { name: "ValidationError" },
        },
      })
      .forEach((path: any) => {
        path.value.right = j.memberExpression(
          j.identifier("z"),
          j.identifier("ZodError")
        );
        modified = true;
      });
  });

  // Direct ValidationError references
  root
    .find(j.MemberExpression, {
      object: { name: (name: string) => namespaces.includes(name) },
      property: { name: "ValidationError" },
    })
    .forEach((path: any) => {
      path.value.object = j.identifier("z");
      path.value.property = j.identifier("ZodError");
      modified = true;
    });

  return modified;
}

/**
 * Transforms runtype assertions to zod schemas
 */
function transformRuntypeToZod(
  j: any,
  root: any,
  namespaces: string[],
  jsCastNodes: Set<string>,
  modified: boolean
): boolean {
  // Map of runtypes to zod equivalents
  const typeMapping: Record<string, string> = {
    String: "string",
    Number: "number",
    Boolean: "boolean",
    Array: "array",
    Tuple: "tuple",
    Object: "object",
    Record: "object", // Pre v7 for objects
    Union: "union",
    Literal: "literal",
    Optional: "optional",
  };

  // Transform direct type references without namespace (String, Number, Boolean, etc.)
  Object.keys(typeMapping).forEach((runtypeKey) => {
    // Skip JavaScript cast functions
    if (jsCastNodes.has(runtypeKey)) {
      return;
    }

    // Direct usage - e.g., String, Number, etc.
    root.find(j.Identifier, { name: runtypeKey }).forEach((path: any) => {
      // Skip if part of import statement, other identifiers or javascript casts
      if (
        path.parent.value.type === "ImportSpecifier" ||
        path.parent.value.type === "TSQualifiedName" ||
        path.name === "property" ||
        jsCastNodes.has(path.value.name)
      ) {
        return;
      }

      // Handle direct type references
      if (
        path.parent.value.type !== "CallExpression" &&
        path.parent.value.type !== "MemberExpression"
      ) {
        // Replace with z.method()
        j(path).replaceWith(
          j.callExpression(
            j.memberExpression(
              j.identifier("z"),
              j.identifier(typeMapping[runtypeKey])
            ),
            []
          )
        );
        modified = true;
      }
    });

    // Invocations - e.g., String.withConstraint(), Array(String), etc.
    root
      .find(j.CallExpression, {
        callee: { name: runtypeKey },
      })
      .forEach((path: any) => {
        // Skip JavaScript casts like String(value)
        if (jsCastNodes.has(runtypeKey)) {
          return;
        }

        // Create z.method() call
        const zodMethod = typeMapping[runtypeKey];
        let newCallee = j.memberExpression(
          j.identifier("z"),
          j.identifier(zodMethod)
        );

        // Handle arguments based on type
        if (runtypeKey === "Array") {
          // Array(Type) -> z.array(z.type())
          const arg = path.value.arguments[0];

          // Special handling for Record with object literal inside Array
          if (
            arg &&
            arg.type === "CallExpression" &&
            arg.callee.type === "Identifier" &&
            arg.callee.name === "Record" &&
            arg.arguments.length === 1 &&
            arg.arguments[0].type === "ObjectExpression"
          ) {
            // Process the Record's object properties
            const objProps = processObjectProperties(
              j,
              arg.arguments[0],
              namespaces,
              jsCastNodes
            );

            // Array(Record({...})) -> z.array(z.object({...}))
            j(path).replaceWith(
              j.callExpression(newCallee, [
                j.callExpression(
                  j.memberExpression(j.identifier("z"), j.identifier("object")),
                  [j.objectExpression(objProps)]
                ),
              ])
            );
          } else {
            // Regular Array handling
            j(path).replaceWith(
              j.callExpression(newCallee, [
                transformArgument(j, arg, namespaces, jsCastNodes),
              ])
            );
          }
        } else if (runtypeKey === "Tuple") {
          // Tuple(A, B, C) -> z.tuple([z.a(), z.b(), z.c()])
          const transformedArgs = path.value.arguments.map((arg: any) =>
            transformArgument(j, arg, namespaces, jsCastNodes)
          );
          j(path).replaceWith(
            j.callExpression(newCallee, [j.arrayExpression(transformedArgs)])
          );
        } else if (runtypeKey === "Union") {
          // Union(A, B, C) -> z.union([z.a(), z.b(), z.c()])
          const transformedArgs = path.value.arguments.map((arg: any) =>
            transformArgument(j, arg, namespaces, jsCastNodes)
          );
          j(path).replaceWith(
            j.callExpression(newCallee, [j.arrayExpression(transformedArgs)])
          );
        } else if (runtypeKey === "Literal") {
          // Literal(value) -> z.literal(value)
          j(path).replaceWith(
            j.callExpression(newCallee, path.value.arguments)
          );
        } else if (runtypeKey === "Optional") {
          // Optional(Type) -> z.type().optional()
          const transformedArg = transformArgument(
            j,
            path.value.arguments[0],
            namespaces,
            jsCastNodes
          );
          j(path).replaceWith(
            j.callExpression(
              j.memberExpression(transformedArg, j.identifier("optional")),
              []
            )
          );
        } else if (runtypeKey === "Record") {
          // Handle both dictionary Record(KeyType, ValueType) and pre-v7 object Record syntax
          if (
            path.value.arguments.length === 1 &&
            path.value.arguments[0].type === "ObjectExpression"
          ) {
            // Pre-v7 Record({...}) -> z.object({...})
            const objProps = processObjectProperties(
              j,
              path.value.arguments[0],
              namespaces,
              jsCastNodes
            );
            j(path).replaceWith(
              j.callExpression(
                j.memberExpression(j.identifier("z"), j.identifier("object")),
                [j.objectExpression(objProps)]
              )
            );
          } else if (path.value.arguments.length === 2) {
            // Record(KeyType, ValueType) -> z.record(z.keyType(), z.valueType())
            const keyType = transformArgument(
              j,
              path.value.arguments[0],
              namespaces,
              jsCastNodes
            );
            const valueType = transformArgument(
              j,
              path.value.arguments[1],
              namespaces,
              jsCastNodes
            );
            j(path).replaceWith(
              j.callExpression(newCallee, [keyType, valueType])
            );
          }
        } else if (runtypeKey === "Object") {
          // Object({...}) -> z.object({...})
          if (
            path.value.arguments.length === 1 &&
            path.value.arguments[0].type === "ObjectExpression"
          ) {
            const objProps = processObjectProperties(
              j,
              path.value.arguments[0],
              namespaces,
              jsCastNodes
            );
            j(path).replaceWith(
              j.callExpression(newCallee, [j.objectExpression(objProps)])
            );
          }
        } else {
          // Default case
          j(path).replaceWith(
            j.callExpression(newCallee, path.value.arguments)
          );
        }

        modified = true;
      });

    // withConstraint -> refine
    root
      .find(j.MemberExpression, {
        object: { name: runtypeKey },
        property: { name: "withConstraint" },
      })
      .forEach((path: any) => {
        // Replace withConstraint with refine
        path.value.object = j.callExpression(
          j.memberExpression(
            j.identifier("z"),
            j.identifier(typeMapping[runtypeKey])
          ),
          []
        );
        path.value.property = j.identifier("refine");
        modified = true;
      });
  });

  // Transform namespaced type references (t.String, t.Number, etc.)
  namespaces.forEach((namespace) => {
    Object.keys(typeMapping).forEach((runtypeKey) => {
      // t.TypeName -> z.typename()
      root
        .find(j.MemberExpression, {
          object: { name: namespace },
          property: { name: runtypeKey },
        })
        .forEach((path: any) => {
          // Skip if it's part of a larger member expression like t.String.withConstraint
          if (
            path.parent.value.type === "MemberExpression" &&
            path.parent.value.object === path.value
          ) {
            return;
          }

          // Handle special cases based on usage
          if (
            path.parent.value.type === "CallExpression" &&
            path.parent.value.callee === path.value
          ) {
            const callExpr = path.parent.value;

            // Special handling for different runtype functions
            if (runtypeKey === "Array") {
              const arg = callExpr.arguments[0];

              // Special handling for t.Record with object literal inside t.Array
              if (
                arg &&
                arg.type === "CallExpression" &&
                arg.callee.type === "MemberExpression" &&
                arg.callee.object.type === "Identifier" &&
                namespaces.includes(arg.callee.object.name) &&
                arg.callee.property.name === "Record" &&
                arg.arguments.length === 1 &&
                arg.arguments[0].type === "ObjectExpression"
              ) {
                // Process the Record's object properties
                const objProps = processObjectProperties(
                  j,
                  arg.arguments[0],
                  namespaces,
                  jsCastNodes
                );

                // t.Array(t.Record({...})) -> z.array(z.object({...}))
                j(path.parent).replaceWith(
                  j.callExpression(
                    j.memberExpression(
                      j.identifier("z"),
                      j.identifier("array")
                    ),
                    [
                      j.callExpression(
                        j.memberExpression(
                          j.identifier("z"),
                          j.identifier("object")
                        ),
                        [j.objectExpression(objProps)]
                      ),
                    ]
                  )
                );
              } else {
                // Regular t.Array handling
                // t.Array(t.String) -> z.array(z.string())
                j(path.parent).replaceWith(
                  j.callExpression(
                    j.memberExpression(
                      j.identifier("z"),
                      j.identifier("array")
                    ),
                    [transformArgument(j, arg, namespaces, jsCastNodes)]
                  )
                );
              }
            } else if (runtypeKey === "Tuple") {
              // t.Tuple(t.String, t.Number) -> z.tuple([z.string(), z.number()])
              const transformedArgs = callExpr.arguments.map((arg: any) =>
                transformArgument(j, arg, namespaces, jsCastNodes)
              );
              j(path.parent).replaceWith(
                j.callExpression(
                  j.memberExpression(j.identifier("z"), j.identifier("tuple")),
                  [j.arrayExpression(transformedArgs)]
                )
              );
            } else if (runtypeKey === "Union") {
              // t.Union(t.String, t.Number) -> z.union([z.string(), z.number()])
              const transformedArgs = callExpr.arguments.map((arg: any) =>
                transformArgument(j, arg, namespaces, jsCastNodes)
              );
              j(path.parent).replaceWith(
                j.callExpression(
                  j.memberExpression(j.identifier("z"), j.identifier("union")),
                  [j.arrayExpression(transformedArgs)]
                )
              );
            } else if (runtypeKey === "Optional") {
              // t.Optional(t.String) -> z.string().optional()
              const transformedArg = transformArgument(
                j,
                callExpr.arguments[0],
                namespaces,
                jsCastNodes
              );
              j(path.parent).replaceWith(
                j.callExpression(
                  j.memberExpression(transformedArg, j.identifier("optional")),
                  []
                )
              );
            } else if (
              runtypeKey === "Record" &&
              callExpr.arguments.length === 1 &&
              callExpr.arguments[0].type === "ObjectExpression"
            ) {
              // Handle pre-v7 syntax: t.Record({...}) -> z.object({...})
              const objProps = processObjectProperties(
                j,
                callExpr.arguments[0],
                namespaces,
                jsCastNodes
              );
              j(path.parent).replaceWith(
                j.callExpression(
                  j.memberExpression(j.identifier("z"), j.identifier("object")),
                  [j.objectExpression(objProps)]
                )
              );
            } else if (
              runtypeKey === "Record" &&
              callExpr.arguments.length === 2
            ) {
              // Dictionary: t.Record(t.String, t.Number) -> z.record(z.string(), z.number())
              const keyType = transformArgument(
                j,
                callExpr.arguments[0],
                namespaces,
                jsCastNodes
              );
              const valueType = transformArgument(
                j,
                callExpr.arguments[1],
                namespaces,
                jsCastNodes
              );
              j(path.parent).replaceWith(
                j.callExpression(
                  j.memberExpression(j.identifier("z"), j.identifier("record")),
                  [keyType, valueType]
                )
              );
            } else if (runtypeKey === "Object") {
              // t.Object({...}) -> z.object({...})
              if (
                callExpr.arguments.length === 1 &&
                callExpr.arguments[0].type === "ObjectExpression"
              ) {
                const objProps = processObjectProperties(
                  j,
                  callExpr.arguments[0],
                  namespaces,
                  jsCastNodes
                );
                j(path.parent).replaceWith(
                  j.callExpression(
                    j.memberExpression(
                      j.identifier("z"),
                      j.identifier("object")
                    ),
                    [j.objectExpression(objProps)]
                  )
                );
              }
            } else if (runtypeKey === "Literal") {
              // t.Literal(value) -> z.literal(value)
              j(path.parent).replaceWith(
                j.callExpression(
                  j.memberExpression(
                    j.identifier("z"),
                    j.identifier("literal")
                  ),
                  callExpr.arguments
                )
              );
            } else {
              // Default method call
              j(path.parent).replaceWith(
                j.callExpression(
                  j.memberExpression(
                    j.identifier("z"),
                    j.identifier(typeMapping[runtypeKey])
                  ),
                  callExpr.arguments
                )
              );
            }
          } else {
            // Direct reference, e.g., { name: t.String }
            j(path).replaceWith(
              j.callExpression(
                j.memberExpression(
                  j.identifier("z"),
                  j.identifier(typeMapping[runtypeKey])
                ),
                []
              )
            );
          }

          modified = true;
        });

      // Handle t.TypeName.withConstraint
      root
        .find(j.MemberExpression, {
          object: {
            type: "MemberExpression",
            object: { name: namespace },
            property: { name: runtypeKey },
          },
          property: { name: "withConstraint" },
        })
        .forEach((path: any) => {
          // Replace t.TypeName.withConstraint with z.typename().refine
          path.value.object = j.callExpression(
            j.memberExpression(
              j.identifier("z"),
              j.identifier(typeMapping[runtypeKey])
            ),
            []
          );
          path.value.property = j.identifier("refine");
          modified = true;
        });
    });
  });

  // Fix properties inside objects with non-aliased types
  root.find(j.Property).forEach((path: any) => {
    if (path.value.value.type === "Identifier") {
      const valueName = path.value.value.name;

      if (
        ["String", "Number", "Boolean"].includes(valueName) &&
        !jsCastNodes.has(valueName)
      ) {
        // Replace with z.method()
        const zodMethod = typeMapping[valueName].toLowerCase();
        j(path).replaceWith(
          j.property(
            "init",
            path.value.key,
            j.callExpression(
              j.memberExpression(j.identifier("z"), j.identifier(zodMethod)),
              []
            )
          )
        );
        modified = true;
      }
    }
  });

  return modified;
}

/**
 * Transforms a runtype argument to a zod schema
 */
function transformArgument(
  j: any,
  arg: any,
  namespaces: string[],
  jsCastNodes: Set<string>
): any {
  if (!arg) return arg;

  // Map of runtypes to zod equivalents
  const typeMapping: Record<string, string> = {
    String: "string",
    Number: "number",
    Boolean: "boolean",
  };

  // Handle direct identifiers (String, Number, Boolean)
  if (
    arg.type === "Identifier" &&
    typeMapping[arg.name] &&
    !jsCastNodes.has(arg.name)
  ) {
    return j.callExpression(
      j.memberExpression(
        j.identifier("z"),
        j.identifier(typeMapping[arg.name])
      ),
      []
    );
  }

  // Handle namespace references (t.String, t.Number, t.Boolean)
  if (
    arg.type === "MemberExpression" &&
    arg.object.type === "Identifier" &&
    namespaces.includes(arg.object.name) &&
    arg.property.type === "Identifier" &&
    typeMapping[arg.property.name]
  ) {
    return j.callExpression(
      j.memberExpression(
        j.identifier("z"),
        j.identifier(typeMapping[arg.property.name])
      ),
      []
    );
  }

  return arg;
}

/**
 * Transforms object properties from runtypes to zod
 */
function processObjectProperties(
  j: any,
  obj: any,
  namespaces: string[],
  jsCastNodes: Set<string>
): any[] {
  const properties: any[] = [];

  // Map of runtypes to zod equivalents for primitive types
  const typeMapping: Record<string, string> = {
    String: "string",
    Number: "number",
    Boolean: "boolean",
  };

  obj.properties.forEach((prop: any) => {
    let newValue;

    // Handle direct identifier primitives
    if (prop.value.type === "Identifier") {
      const name = prop.value.name;
      if (typeMapping[name] && !jsCastNodes.has(name)) {
        newValue = j.callExpression(
          j.memberExpression(
            j.identifier("z"),
            j.identifier(typeMapping[name])
          ),
          []
        );
      } else {
        newValue = prop.value; // Keep original for non-runtype identifiers
      }
    }
    // Handle namespace members (t.String)
    else if (
      prop.value.type === "MemberExpression" &&
      prop.value.object.type === "Identifier" &&
      namespaces.includes(prop.value.object.name)
    ) {
      const typeName = prop.value.property.name;
      if (typeMapping[typeName]) {
        // Simple primitives: t.String -> z.string()
        newValue = j.callExpression(
          j.memberExpression(
            j.identifier("z"),
            j.identifier(typeMapping[typeName])
          ),
          []
        );
      } else {
        // This will be handled by the more comprehensive transformation later
        newValue = prop.value;
      }
    }
    // Handle nested type calls like Array(String)
    else if (prop.value.type === "CallExpression") {
      newValue = prop.value; // Will be handled by the comprehensive transforms
    }
    // Handle Optional types specially
    else if (
      prop.value.type === "CallExpression" &&
      prop.value.callee.type === "Identifier" &&
      prop.value.callee.name === "Optional"
    ) {
      // Optional(Type) -> transformed type.optional()
      const innerType = transformArgument(
        j,
        prop.value.arguments[0],
        namespaces,
        jsCastNodes
      );
      newValue = j.callExpression(
        j.memberExpression(innerType, j.identifier("optional")),
        []
      );
    }
    // Handle t.Optional specially
    else if (
      prop.value.type === "CallExpression" &&
      prop.value.callee.type === "MemberExpression" &&
      prop.value.callee.object.type === "Identifier" &&
      namespaces.includes(prop.value.callee.object.name) &&
      prop.value.callee.property.name === "Optional"
    ) {
      // t.Optional(t.Type) -> z.type().optional()
      const innerType = transformArgument(
        j,
        prop.value.arguments[0],
        namespaces,
        jsCastNodes
      );
      newValue = j.callExpression(
        j.memberExpression(innerType, j.identifier("optional")),
        []
      );
    } else {
      newValue = prop.value; // Preserve original for anything else
    }

    properties.push(j.property("init", prop.key, newValue));
  });

  return properties;
}

/**
 * Gets the variable name assigned to a validation result
 */
function getResultVariableName(callExpressionPath: any): string | null {
  const parent = callExpressionPath.parent;
  if (parent.value.type === "VariableDeclarator") {
    return parent.value.id.name;
  }

  if (parent.value.type === "AssignmentExpression") {
    return parent.value.left.name;
  }

  return null;
}

export default transform;
