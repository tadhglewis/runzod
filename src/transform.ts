import { API, FileInfo, Options } from 'jscodeshift';

/**
 * Codemod to transform runtypes to zod
 */
export default function transformer(
  file: FileInfo,
  api: API,
  options: Options
) {
  const j = api.jscodeshift;
  const root = j(file.source);
  
  let hasModifications = false;
  let hasZodImport = false;
  let namespaceIdentifier: string | null = null;

  // Pre-check for namespace imports to prepare for transformation
  root
    .find(j.ImportDeclaration)
    .filter(path => {
      const importPath = path.node.source.value;
      return typeof importPath === 'string' && importPath === 'runtypes';
    })
    .find(j.ImportNamespaceSpecifier)
    .forEach(path => {
      if (path.node.local && typeof path.node.local.name === 'string') {
        namespaceIdentifier = path.node.local.name;
      }
    });

  // Handle imports: replace runtypes import with zod
  root
    .find(j.ImportDeclaration)
    .forEach(path => {
      const importPath = path.node.source.value;
      
      if (typeof importPath === 'string' && importPath === 'runtypes') {
        // Check if any runtypes imports are used
        const specifiers = path.node.specifiers;
        if (specifiers && specifiers.length > 0) {
          hasModifications = true;
          
          // Create a zod import statement
          const zodImport = j.importDeclaration(
            [j.importDefaultSpecifier(j.identifier('z'))],
            j.literal('zod')
          );
          
          // Replace the runtypes import with zod
          j(path).replaceWith(zodImport);
          hasZodImport = true;
        }
      }
    });

  // We'll track which identifiers are used as direct call expressions
  // These are likely JavaScript casts rather than runtypes
  const jsCastIdentifiers = new Set<string>();
  
  // Find CallExpressions that look like JS casts: String(), Number(), Boolean()
  root
    .find(j.CallExpression, {
      callee: {
        type: 'Identifier'
      }
    })
    .forEach(path => {
      if (j.Identifier.check(path.node.callee)) {
        const name = path.node.callee.name;
        if (['String', 'Number', 'Boolean'].includes(name)) {
          jsCastIdentifiers.add(name);
        }
      }
    });
    
  // Function to transform runtypes to zod
  const transformRuntype = (node: any): any => {
    // Function to check if this is likely a runtype or a JS cast
    const isRuntype = (identifier: string): boolean => {
      // If we saw this identifier used as a JS cast, be cautious about transforming it
      if (jsCastIdentifiers.has(identifier)) {
        // Only transform if it's in a context that looks like a runtype (object property, etc.)
        return false;
      }
      
      return true;
    };
    
    // Handle String => z.string()
    if (j.Identifier.check(node) && node.name === 'String' && isRuntype(node.name)) {
      hasModifications = true;
      return j.callExpression(
        j.memberExpression(j.identifier('z'), j.identifier('string')),
        []
      );
    }
    
    // Handle Number => z.number()
    if (j.Identifier.check(node) && node.name === 'Number' && isRuntype(node.name)) {
      hasModifications = true;
      return j.callExpression(
        j.memberExpression(j.identifier('z'), j.identifier('number')),
        []
      );
    }
    
    // Handle Boolean => z.boolean()
    if (j.Identifier.check(node) && node.name === 'Boolean' && isRuntype(node.name)) {
      hasModifications = true;
      return j.callExpression(
        j.memberExpression(j.identifier('z'), j.identifier('boolean')),
        []
      );
    }
    
    // Handle Undefined => z.undefined()
    if (j.Identifier.check(node) && node.name === 'Undefined') {
      hasModifications = true;
      return j.callExpression(
        j.memberExpression(j.identifier('z'), j.identifier('undefined')),
        []
      );
    }
    
    // Handle Null => z.null()
    if (j.Identifier.check(node) && node.name === 'Null') {
      hasModifications = true;
      return j.callExpression(
        j.memberExpression(j.identifier('z'), j.identifier('null')),
        []
      );
    }
    
    // Handle Literal() => z.literal()
    if (
      j.CallExpression.check(node) &&
      j.Identifier.check(node.callee) &&
      node.callee.name === 'Literal'
    ) {
      hasModifications = true;
      return j.callExpression(
        j.memberExpression(j.identifier('z'), j.identifier('literal')),
        node.arguments
      );
    }
    
    // Handle Array() => z.array()
    if (
      j.CallExpression.check(node) &&
      j.Identifier.check(node.callee) &&
      node.callee.name === 'Array'
    ) {
      hasModifications = true;
      if (node.arguments.length === 1) {
        return j.callExpression(
          j.memberExpression(j.identifier('z'), j.identifier('array')),
          [transformRuntype(node.arguments[0])]
        );
      }
    }
    
    // Handle Tuple() => z.tuple()
    if (
      j.CallExpression.check(node) &&
      j.Identifier.check(node.callee) &&
      node.callee.name === 'Tuple'
    ) {
      hasModifications = true;
      return j.callExpression(
        j.memberExpression(j.identifier('z'), j.identifier('tuple')),
        [j.arrayExpression(node.arguments.map((arg: any) => transformRuntype(arg)))]
      );
    }
    
    // Handle Object() => z.object()
    if (
      j.CallExpression.check(node) &&
      j.Identifier.check(node.callee) &&
      node.callee.name === 'Object'
    ) {
      hasModifications = true;
      if (node.arguments.length === 1 && j.ObjectExpression.check(node.arguments[0])) {
        const properties: any[] = node.arguments[0].properties.map((prop: any) => {
          return j.property(
            'init',  // Always use 'init' for object properties
            prop.key,
            transformRuntype(prop.value)
          );
        });
        
        return j.callExpression(
          j.memberExpression(j.identifier('z'), j.identifier('object')),
          [j.objectExpression(properties)]
        );
      }
    }
    
    // Handle Union() => z.union()
    if (
      j.CallExpression.check(node) &&
      j.Identifier.check(node.callee) &&
      node.callee.name === 'Union'
    ) {
      hasModifications = true;
      return j.callExpression(
        j.memberExpression(j.identifier('z'), j.identifier('union')),
        [j.arrayExpression(node.arguments.map((arg: any) => transformRuntype(arg)))]
      );
    }
    
    // Handle Record() => z.record()
    if (
      j.CallExpression.check(node) &&
      j.Identifier.check(node.callee) &&
      node.callee.name === 'Record'
    ) {
      hasModifications = true;
      if (node.arguments.length === 2) {
        return j.callExpression(
          j.memberExpression(j.identifier('z'), j.identifier('record')),
          [
            transformRuntype(node.arguments[0]),
            transformRuntype(node.arguments[1])
          ]
        );
      }
    }
    
    // Handle Dictionary() => z.record() (since zod uses record for dictionaries)
    if (
      j.CallExpression.check(node) &&
      j.Identifier.check(node.callee) &&
      node.callee.name === 'Dictionary'
    ) {
      hasModifications = true;
      if (node.arguments.length === 2) {
        return j.callExpression(
          j.memberExpression(j.identifier('z'), j.identifier('record')),
          [
            transformRuntype(node.arguments[0]),
            transformRuntype(node.arguments[1])
          ]
        );
      }
    }
    
    // Handle Optional() => z.optional()
    if (
      j.CallExpression.check(node) &&
      j.Identifier.check(node.callee) &&
      node.callee.name === 'Optional'
    ) {
      hasModifications = true;
      if (node.arguments.length === 1) {
        const innerType: any = transformRuntype(node.arguments[0]);
        return j.callExpression(
          j.memberExpression(innerType, j.identifier('optional')),
          []
        );
      }
    }
    
    // Handle withConstraint => refine
    if (
      j.CallExpression.check(node) &&
      j.MemberExpression.check(node.callee) &&
      j.Identifier.check(node.callee.property) &&
      node.callee.property.name === 'withConstraint'
    ) {
      hasModifications = true;
      const baseType: any = transformRuntype(node.callee.object);
      return j.callExpression(
        j.memberExpression(baseType, j.identifier('refine')),
        node.arguments
      );
    }
    
    // If no transformation was applied, return the original node
    return node;
  };

  // Process identifiers and call expressions - standard approach
  // Find and transform all call expressions that might be runtypes
  root
    .find(j.CallExpression)
    .forEach(path => {
      const transformed = transformRuntype(path.node);
      if (transformed !== path.node) {
        j(path).replaceWith(transformed);
      }
    });
  
  // Handle identifiers (like String, Number, etc.)
  root
    .find(j.Identifier)
    .filter(path => {
      const name = path.node.name;
      return ['String', 'Number', 'Boolean', 'Undefined', 'Null'].includes(name);
    })
    .forEach(path => {
      // Make sure it's not part of a property access or already handled
      if (
        !j.MemberExpression.check(path.parent.node) ||
        path.parent.node.object !== path.node
      ) {
        const transformed = transformRuntype(path.node);
        if (transformed !== path.node) {
          j(path).replaceWith(transformed);
        }
      }
    });

  // Handle namespaced imports (RT.String, RT.Number, etc.)
  if (namespaceIdentifier) {
    // Namespace member transform function
    const transformNamespaceMember = (prop: string): any => {
      if (['String', 'Number', 'Boolean', 'Undefined', 'Null'].includes(prop)) {
        return j.callExpression(
          j.memberExpression(j.identifier('z'), j.identifier(prop.toLowerCase())),
          []
        );
      }
      return null;
    };
    
    // Handle direct namespace references like RT.String
    root
      .find(j.MemberExpression, {
        object: { name: namespaceIdentifier }
      })
      .forEach(path => {
        if (j.Identifier.check(path.node.property)) {
          const propName = path.node.property.name;
          const transformed = transformNamespaceMember(propName);
          
          if (transformed) {
            j(path).replaceWith(transformed);
            hasModifications = true;
          }
        }
      });
    
    // Handle RT.Array(RT.String) patterns
    root
      .find(j.CallExpression, {
        callee: {
          type: 'MemberExpression',
          object: { name: namespaceIdentifier }
        }
      })
      .forEach(path => {
        if (j.MemberExpression.check(path.node.callee) && 
            j.Identifier.check(path.node.callee.property)) {
          
          const funcName = path.node.callee.property.name;
          
          // Transform any arguments that are namespace references
          const transformedArgs = path.node.arguments.map((arg: any) => {
            if (j.MemberExpression.check(arg) && 
                j.Identifier.check(arg.object) && 
                arg.object.name === namespaceIdentifier &&
                j.Identifier.check(arg.property)) {
              
              const argPropName = arg.property.name;
              const transformed = transformNamespaceMember(argPropName);
              if (transformed) {
                return transformed;
              }
            }
            return arg;
          });
          
          // Set the transformed arguments
          path.node.arguments = transformedArgs;
          
          // Create a zod equivalent function name based on runtype name
          let zodFuncName;
          switch (funcName) {
            case 'Record':
            case 'Dictionary':
              // Set hasModifications to true to ensure record transformation happens
              hasModifications = true;
              zodFuncName = 'record';
              break;
            case 'Object':
              zodFuncName = 'object';
              break;
            case 'Array':
              zodFuncName = 'array';
              break;
            case 'Tuple':
              // Special case for tuple
              hasModifications = true;
              const tupleArgs = j.arrayExpression(path.node.arguments);
              return j(path).replaceWith(
                j.callExpression(
                  j.memberExpression(j.identifier('z'), j.identifier('tuple')),
                  [tupleArgs]
                )
              );
            case 'Union':
              // Special case for union
              hasModifications = true;
              const unionArgs = j.arrayExpression(path.node.arguments);
              return j(path).replaceWith(
                j.callExpression(
                  j.memberExpression(j.identifier('z'), j.identifier('union')),
                  [unionArgs]
                )
              );
            case 'Optional':
              // Special case for optional
              hasModifications = true;
              if (path.node.arguments.length === 1) {
                const arg = path.node.arguments[0];
                if (arg.type !== 'SpreadElement') {
                  return j(path).replaceWith(
                    j.callExpression(
                      j.memberExpression(
                        arg,
                        j.identifier('optional')
                      ),
                      []
                    )
                  );
                }
              }
              break;
            case 'Literal':
              zodFuncName = 'literal';
              break;
            case 'static':
              // Transform t.static to z.infer
              hasModifications = true;
              zodFuncName = 'infer';
              break;
            default:
              zodFuncName = funcName.toLowerCase();
          }
          
          // Replace with z.object(), z.array(), etc.
          if (zodFuncName) {
            hasModifications = true;
            j(path).replaceWith(
              j.callExpression(
                j.memberExpression(j.identifier('z'), j.identifier(zodFuncName)),
                path.node.arguments
              )
            );
          }
        }
      });
      
    // Process ObjectExpression arguments that have nested RT references
    root
      .find(j.ObjectExpression)
      .forEach(path => {
        path.node.properties.forEach((prop: any) => {
          if (prop.value && 
              j.MemberExpression.check(prop.value) && 
              j.Identifier.check(prop.value.object) &&
              prop.value.object.name === namespaceIdentifier &&
              j.Identifier.check(prop.value.property)) {
            
            const propName = prop.value.property.name;
            const transformed = transformNamespaceMember(propName);
            
            if (transformed) {
              prop.value = transformed;
              hasModifications = true;
            }
          }
        });
      });
  }
  
  // Add a post-processing step to catch any remaining namespace references
  if (namespaceIdentifier) {
    // Simple string replacement only for the final output
    // We'll handle this when returning the output
    hasModifications = true;
  }

  // Add zod import if we made modifications and don't already have it
  if (hasModifications && !hasZodImport) {
    const zodImport = j.importDeclaration(
      [j.importDefaultSpecifier(j.identifier('z'))],
      j.literal('zod')
    );
    
    // Add at the top of the file
    const firstNode = root.find(j.Program).get('body', 0).node;
    if (firstNode) {
      root.find(j.Program).get('body', 0).insertBefore(zodImport);
    } else {
      root.find(j.Program).get('body').unshift(zodImport);
    }
  }
  
  if (hasModifications) {
    let result = root.toSource({ quote: 'single' });
    
    // Final cleanup for any remaining namespace references
    if (namespaceIdentifier) {
      // First, replace any RT.z.string() patterns with z.string()
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.z\\.`, 'g'), 
        'z.'
      );
      
      // Replace t.Record({...}) with z.record({...})
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Record\\(`, 'g'),
        'z.record('
      );
      
      // Replace t.Dictionary(...) with z.record(...)
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Dictionary\\(`, 'g'),
        'z.record('
      );
      
      // Replace t.Object({...}) with z.object({...})
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Object\\(`, 'g'),
        'z.object('
      );
      
      // Replace t.Array(z.string()) with z.array(z.string())
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Array\\(`, 'g'),
        'z.array('
      );
      
      // Replace t.Tuple(...) with z.tuple([...])
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Tuple\\(([^)]*)\\)`, 'g'),
        (match, args) => {
          // This keeps the args but wraps them in an array for z.tuple([...])
          return `z.tuple([${args}])`;
        }
      );
            
      // Replace t.Union(...) with z.union([...])
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Union\\(([^)]*)\\)`, 'g'),
        (match, args) => {
          return `z.union([${args}])`;
        }
      );
      
      // Replace t.Literal(...) with z.literal(...)
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Literal\\(`, 'g'),
        'z.literal('
      );
      
      // Replace t.Optional(X) with X.optional()
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Optional\\(([^)]*)\\)`, 'g'),
        (match, arg) => {
          return `${arg}.optional()`;
        }
      );
      
      // Fix broken .optional() syntax that might occur from other transformations
      result = result.replace(/(\w+)\(\.optional\(\)\)/g, '$1().optional()');
      
      // Replace t.String with z.string()
      // Use word boundaries to avoid matching substrings
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.String\\b`, 'g'),
        'z.string()'
      );
      
      // Replace t.Number with z.number()
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Number\\b`, 'g'),
        'z.number()'
      );
      
      // Replace t.Boolean with z.boolean()
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Boolean\\b`, 'g'),
        'z.boolean()'
      );
      
      // Replace t.Undefined with z.undefined()
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Undefined\\b`, 'g'),
        'z.undefined()'
      );
      
      // Replace t.Null with z.null()
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Null\\b`, 'g'),
        'z.null()'
      );
      
      // Replace t.static<...> with z.infer<...>
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.static\\b`, 'g'),
        'z.infer'
      );
    }
    
    return result;
  }
  
  return file.source;
}