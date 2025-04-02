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

  // Function to transform runtypes to zod
  const transformRuntype = (node: any): any => {
    // Handle String => z.string()
    if (j.Identifier.check(node) && node.name === 'String') {
      hasModifications = true;
      return j.callExpression(
        j.memberExpression(j.identifier('z'), j.identifier('string')),
        []
      );
    }
    
    // Handle Number => z.number()
    if (j.Identifier.check(node) && node.name === 'Number') {
      hasModifications = true;
      return j.callExpression(
        j.memberExpression(j.identifier('z'), j.identifier('number')),
        []
      );
    }
    
    // Handle Boolean => z.boolean()
    if (j.Identifier.check(node) && node.name === 'Boolean') {
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
          
          // Now transform the function call itself
          const funcNode = j.callExpression(
            j.identifier(funcName),
            path.node.arguments
          );
          
          const transformed = transformRuntype(funcNode);
          j(path).replaceWith(transformed);
          hasModifications = true;
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
      
      // Replace RT.Array(z.string()) with z.array(z.string())
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Array\\(`, 'g'),
        'z.array('
      );
      
      // Replace RT.Tuple(...) with z.tuple([...])
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Tuple\\(([^)]*)\\)`, 'g'),
        (match, args) => {
          // This keeps the args but wraps them in an array for z.tuple([...])
          return `z.tuple([${args}])`;
        }
      );
      
      // Replace RT.Object({...}) with z.object({...})
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Object\\(`, 'g'),
        'z.object('
      );
      
      // Replace RT.Record(...) with z.record(...)
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Record\\(`, 'g'),
        'z.record('
      );
      
      // Replace RT.Union(...) with z.union([...])
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Union\\(([^)]*)\\)`, 'g'),
        (match, args) => {
          return `z.union([${args}])`;
        }
      );
      
      // Replace RT.Literal(...) with z.literal(...)
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Literal\\(`, 'g'),
        'z.literal('
      );
      
      // Replace RT.Optional(X) with X.optional()
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Optional\\(([^)]*)\\)`, 'g'),
        (match, arg) => {
          return `${arg}.optional()`;
        }
      );
      
      // Fix broken .optional() syntax that might occur from other transformations
      result = result.replace(/(\w+)\(\.optional\(\)\)/g, '$1().optional()');
      
      // Replace RT.String with z.string()
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.String`, 'g'),
        'z.string()'
      );
      
      // Replace RT.Number with z.number()
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Number`, 'g'),
        'z.number()'
      );
      
      // Replace RT.Boolean with z.boolean()
      result = result.replace(
        new RegExp(`${namespaceIdentifier}\\.Boolean`, 'g'),
        'z.boolean()'
      );
    }
    
    return result;
  }
  
  return file.source;
}