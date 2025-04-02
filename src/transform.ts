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

  // Find any namespace imports for runtypes (e.g., import * as t from "runtypes")
  let namespacePrefix: string | null = null;
  
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
      
      // Check if this is a namespace import
      if (path.node.specifiers) {
        path.node.specifiers.forEach(specifier => {
          if (j.ImportNamespaceSpecifier.check(specifier)) {
            // Store the namespace prefix for later usage
            namespacePrefix = (specifier.local as Identifier).name;
          }
        });
      }

      // Remove runtypes imports and prepare to add zod import
      j(path).remove();
    });

  // First, create a separate transformation to handle JavaScript builtin function calls
  // To avoid them being treated as runtypes types
  
  // Mark any Boolean, String, Number as JavaScript built-ins when used as function calls
  root
    .find(j.CallExpression)
    .filter((path) => {
      return (
        j.Identifier.check(path.node.callee) &&
        ["Boolean", "String", "Number"].includes(path.node.callee.name)
      );
    })
    .forEach((path) => {
      // Add a property to mark this as a JavaScript function
      (path.node.callee as any).__jsBuiltin = true;
    });
    
  // Also mark any Boolean, String, Number as JavaScript built-ins when used as arguments
  // This handles cases like array.filter(Boolean)
  root
    .find(j.Identifier)
    .filter((path) => {
      return (
        ["Boolean", "String", "Number"].includes(path.node.name) &&
        // Used as function argument
        ((j.CallExpression.check(path.parent.node) && 
          path.parent.node.arguments.includes(path.node)) ||
        // Used in member expression chain (not as object)
        (j.MemberExpression.check(path.parent.node) && 
          path.parent.node.property === path.node))
      );
    })
    .forEach((path) => {
      // Mark as JavaScript built-in
      (path.node as any).__jsBuiltin = true;
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

      // Skip JavaScript built-in Boolean function that we've marked
      if ((path.node as any).__jsBuiltin) {
        return;
      }

      // Don't replace callee part of call expressions like Boolean(), String(), Number()
      if (
        j.CallExpression.check(path.parent.node) &&
        path.parent.node.callee === path.node &&
        ["Boolean", "String", "Number"].includes(path.node.name)
      ) {
        // Skip JS built-in function calls
        return;
      }

      // Don't replace the callee part of other call expressions
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
        // Check if all arguments are Literal calls - if so, convert to z.enum([...])
        const allLiterals = path.node.arguments.every(arg => 
          j.CallExpression.check(arg) && 
          j.Identifier.check(arg.callee) && 
          arg.callee.name === "Literal"
        );
        
        if (allLiterals) {
          // Extract the literal values
          const literalValues = path.node.arguments.map(arg => {
            const literalArg = (arg as CallExpression).arguments[0];
            // Return the literal value (likely a string or number literal)
            return literalArg;
          });
          
          // Replace with z.enum([...])
          j(path).replaceWith(
            j.callExpression(
              j.memberExpression(j.identifier("z"), j.identifier("enum")),
              [j.arrayExpression(literalValues)]
            )
          );
          return;
        }
        
        // Otherwise, standard Union(A, B, C) -> z.union([A, B, C])
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

  // Handle namespace imports (e.g., t.String, t.Object, etc.)
  if (namespacePrefix) {
    // Find namespace calls like t.Array(t.String)
    root
      .find(j.CallExpression)
      .filter((path: ASTPath<CallExpression>) => {
        return (
          j.MemberExpression.check(path.node.callee) &&
          j.Identifier.check(path.node.callee.object) &&
          (path.node.callee.object as Identifier).name === namespacePrefix &&
          j.Identifier.check(path.node.callee.property) &&
          Object.keys(typeMapping).includes((path.node.callee.property as Identifier).name)
        );
      })
      .forEach((path: ASTPath<CallExpression>) => {
        const callee = path.node.callee as MemberExpression;
        const typeName = (callee.property as Identifier).name;
        const mappedType = typeMapping[typeName];
        
        if (!mappedType) {
          return;
        }
        
        // Handle special cases for type constructors
        if ((typeName === "Array" || typeName === "Object" || typeName === "Union") && path.node.arguments.length > 0) {
          // Extract the argument
          const arg = path.node.arguments[0];
          let argNode = null;
          
          // Handle t.Array(t.String) -> z.array(z.string())
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
          
          // Create the appropriate call expression
          let zodExpr;
          if (typeName === "Array") {
            zodExpr = j.callExpression(
              j.memberExpression(j.identifier("z"), j.identifier("array")),
              argNode ? [argNode] : [arg]
            );
          } else if (typeName === "Object") {
            // It's an Object type, direct mapping is z.object
            zodExpr = j.callExpression(
              j.memberExpression(j.identifier("z"), j.identifier("object")),
              [arg] // Keep the original argument (object literal)
            );
          } else if (typeName === "Union") {
            // Check if all arguments are t.Literal calls - if so, convert to z.enum([...])
            const allLiterals = path.node.arguments.every(arg => 
              j.CallExpression.check(arg) && 
              j.MemberExpression.check(arg.callee) && 
              j.Identifier.check(arg.callee.object) &&
              (arg.callee.object as Identifier).name === namespacePrefix &&
              j.Identifier.check(arg.callee.property) &&
              (arg.callee.property as Identifier).name === "Literal"
            );
            
            if (allLiterals) {
              // Extract the literal values
              const literalValues = path.node.arguments.map(arg => {
                const literalArg = (arg as CallExpression).arguments[0];
                // Return the literal value (likely a string or number literal)
                return literalArg;
              });
              
              // Replace with z.enum([...])
              zodExpr = j.callExpression(
                j.memberExpression(j.identifier("z"), j.identifier("enum")),
                [j.arrayExpression(literalValues)]
              );
            } else {
              // Standard Union call
              zodExpr = j.callExpression(
                j.memberExpression(j.identifier("z"), j.identifier("union")),
                [j.arrayExpression(path.node.arguments)]
              );
            }
          }
          
          // Process object properties if they contain namespace references
          if (typeName === "Object" && j.ObjectExpression.check(arg)) {
            arg.properties.forEach(prop => {
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
          
          // Replace the entire call expression
          j(path).replaceWith(zodExpr);
          hasModifications = true;
          return;
        }
        
        // For other types, just change t.X() to the corresponding z expression
        if (mappedType.includes("(")) {
          // For complete expressions like z.string()
          j(path).replaceWith(parseZodExpression(mappedType));
        } else {
          // For expressions that need arguments like z.object
          path.node.callee = parseZodExpression(mappedType);
        }
        hasModifications = true;
      });
      
    // Find all member expressions with the namespace prefix
    root
      .find(j.MemberExpression)
      .filter((path: ASTPath<MemberExpression>) => {
        return (
          j.Identifier.check(path.node.object) &&
          (path.node.object as Identifier).name === namespacePrefix &&
          j.Identifier.check(path.node.property) &&
          Object.keys(typeMapping).includes((path.node.property as Identifier).name)
        );
      })
      .forEach((path: ASTPath<MemberExpression>) => {
        const typeName = (path.node.property as Identifier).name;
        const mappedType = typeMapping[typeName];

        if (!mappedType) {
          return;
        }

        // Special case for usage in CallExpression as an argument
        if (j.CallExpression.check(path.parent.node) && path.parent.node.arguments.includes(path.node)) {
          // Handle t.String as argument to another function (transform to z.string())
          if (["String", "Number", "Boolean", "Null", "Undefined", "Unknown", "Void", "Never"].includes(typeName)) {
            j(path).replaceWith(parseZodExpression(mappedType));
            hasModifications = true;
          } else {
            // For other types, just change the namespace
            path.node.object = j.identifier("z");
            const propertyName = typeName.toLowerCase();
            // Special cases for casing
            if (typeName === "Object" || typeName === "Record") {
              path.node.property = j.identifier("object");
            } else if (typeName === "Intersect") {
              path.node.property = j.identifier("intersection");
            } else {
              path.node.property = j.identifier(propertyName);
            }
            hasModifications = true;
          }
        }
        // Simple replacement for primitive types
        else if (["String", "Number", "Boolean", "Null", "Undefined", "Unknown", "Void", "Never"].includes(typeName)) {
          j(path).replaceWith(parseZodExpression(mappedType));
          hasModifications = true;
        } 
        // For types that need arguments, keep the member expression form but change the prefix
        else if (["Array", "Tuple", "Record", "Object", "Union", "Intersect", "Optional", "Literal"].includes(typeName)) {
          // Simply change t.X to z.x (preserving casing where needed)
          path.node.object = j.identifier("z");
          const propertyName = typeName.toLowerCase();
          // Special cases for casing
          if (typeName === "Object" || typeName === "Record") {
            path.node.property = j.identifier("object");
          } else if (typeName === "Intersect") {
            path.node.property = j.identifier("intersection");
          } else {
            path.node.property = j.identifier(propertyName);
          }
          hasModifications = true;
        }
      });
      
    // Find namespace Static types and convert to z.infer
    root
      .find(j.TSTypeReference)
      .forEach((path: ASTPath<TSTypeReference>) => {
        if (
          path.node.typeName && 
          typeof path.node.typeName === 'object' &&
          'object' in path.node.typeName &&
          'property' in path.node.typeName &&
          path.node.typeName.object && 
          path.node.typeName.property && 
          j.Identifier.check(path.node.typeName.object) &&
          (path.node.typeName.object as Identifier).name === namespacePrefix &&
          j.Identifier.check(path.node.typeName.property) &&
          (path.node.typeName.property as Identifier).name === "Static"
        ) {
          hasModifications = true;
          // Replace t.Static with z.infer
          path.node.typeName = j.memberExpression(
            j.identifier("z"),
            j.identifier("infer")
          ) as any;
        }
      });
      
    // Handle namespace method calls like t.String.guard(), t.Number.check(), etc.
    root
      .find(j.MemberExpression)
      .filter((path: ASTPath<MemberExpression>) => {
        return (
          j.MemberExpression.check(path.node.object) &&
          j.Identifier.check(path.node.object.object) &&
          (path.node.object.object as Identifier).name === namespacePrefix &&
          j.Identifier.check(path.node.object.property) &&
          Object.keys(typeMapping).includes((path.node.object.property as Identifier).name) &&
          j.Identifier.check(path.node.property) &&
          ["check", "guard", "parse"].includes((path.node.property as Identifier).name)
        );
      })
      .forEach((path: ASTPath<MemberExpression>) => {
        // Ensure we're dealing with a MemberExpression with property field
        const objectExpr = path.node.object as MemberExpression;
        const typeName = (objectExpr.property as Identifier).name;
        const methodName = (path.node.property as Identifier).name;
        
        // Check if we're in an if statement condition for guard
        const isInIfCondition = 
          methodName === "guard" && 
          path.parent && 
          j.CallExpression.check(path.parent.node) && 
          path.parent.parent &&
          j.IfStatement.check(path.parent.parent.node) && 
          path.parent.parent.node.test === path.parent.node;
          
        // Transform t.Type.method() to z.type().zodMethod()
        if (["String", "Number", "Boolean", "Null", "Undefined", "Unknown", "Void", "Never"].includes(typeName)) {
          const mappedType = typeMapping[typeName];
          if (mappedType) {
            // Replace with the appropriate zod method
            const newMethod = methodName === "guard" ? "safeParse" : "parse";
            
            // Create the base expression: z.type().method
            const baseExpr = j.memberExpression(
              parseZodExpression(mappedType),
              j.identifier(newMethod)
            );
            
            // If this is a guard method in an if condition, we need to add .success
            if (isInIfCondition) {
              const callExpr = path.parent.node as CallExpression;
              j(path.parent).replaceWith(
                j.memberExpression(
                  j.callExpression(baseExpr, callExpr.arguments),
                  j.identifier("success")
                )
              );
            } else {
              // Just replace the method expression
              j(path).replaceWith(baseExpr);
            }
            
            hasModifications = true;
          }
        }
      });
  }  

  // Replace validation methods
  root
    .find(j.MemberExpression)
    .filter((path: ASTPath<MemberExpression>) => {
      return (
        j.Identifier.check(path.node.property) &&
        ["check", "guard", "parse"].includes(
          (path.node.property as Identifier).name
        ) && 
        // Special case for namespace methods like t.Boolean.guard()
        (!namespacePrefix || 
          !j.MemberExpression.check(path.node.object) || 
          !j.Identifier.check(path.node.object.object) ||
          (path.node.object.object as Identifier).name !== namespacePrefix)
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

  // Get the transformed source code
  let transformedSource = hasModifications ? root.toSource() : file.source;
  
  // Post-processing to fix any remaining namespace issues
  if (namespacePrefix) {
    // Replace any remaining t.z.string() or similar patterns with z.string()
    transformedSource = transformedSource.replace(
      new RegExp(`${namespacePrefix}\\.z\\.([a-zA-Z]+)(\\(\\))`, 'g'),
      'z.$1$2'
    );
    
    // Replace any t.Static with z.infer
    transformedSource = transformedSource.replace(
      new RegExp(`${namespacePrefix}\\.Static`, 'g'),
      'z.infer'
    );
    
    // Replace t.Boolean.guard(data) with z.boolean().safeParse(data).success
    transformedSource = transformedSource.replace(
      new RegExp(`${namespacePrefix}\\.([A-Z][a-zA-Z]*)\\.guard\\(([^)]+)\\)`, 'g'),
      (match, type, arg) => {
        const lowerType = type.toLowerCase();
        return `z.${lowerType}().safeParse(${arg}).success`;
      }
    );
    
    // Replace t.Array(t.String) with z.array(z.string())
    transformedSource = transformedSource.replace(
      new RegExp(`${namespacePrefix}\\.Array\\(${namespacePrefix}\\.([A-Z][a-zA-Z]*)\\)`, 'g'),
      (match, type) => {
        const lowerType = type.toLowerCase();
        return `z.array(z.${lowerType}())`;
      }
    );
    
    // Explicitly fix return statements using safeParse to add .success
    transformedSource = transformedSource.replace(
      /return\s+z\.([a-zA-Z]+)\(\)\.safeParse\((.*?)\);/g,
      'return z.$1().safeParse($2).success;'
    );
  }
  
  // Fix any mistakenly transformed JavaScript built-in function calls
  // Handle standard inline cases
  transformedSource = transformedSource.replace(/z\.boolean\(\)\((.*?)\)/g, 'Boolean($1)');
  transformedSource = transformedSource.replace(/z\.string\(\)\((.*?)\)/g, 'String($1)');
  transformedSource = transformedSource.replace(/z\.number\(\)\((.*?)\)/g, 'Number($1)');
  
  // Handle multi-line cases with non-greedy matching
  transformedSource = transformedSource.replace(/z\.boolean\(\)\s*\(\s*([\s\S]*?)\s*\)/g, 'Boolean($1)');
  transformedSource = transformedSource.replace(/z\.string\(\)\s*\(\s*([\s\S]*?)\s*\)/g, 'String($1)');
  transformedSource = transformedSource.replace(/z\.number\(\)\s*\(\s*([\s\S]*?)\s*\)/g, 'Number($1)');
  
  // Fix filter(Boolean) cases - look for .filter followed by z.boolean()
  transformedSource = transformedSource.replace(/\.filter\s*\(\s*z\.boolean\(\)\s*\)/g, '.filter(Boolean)');

  return transformedSource;
}

export default transformer;
