import { Transform, ImportSpecifier, Identifier, MemberExpression, Expression, CallExpression } from 'jscodeshift';

const transform: Transform = (file, api, options) => {
  const j = api.jscodeshift;
  const root = j(file.source);

  // Track if we need to add the z namespace
  let hasImportedFromZod = false;
  let needsZodNamespace = false;

  // Replace import statements
  root
    .find(j.ImportDeclaration, {
      source: { value: 'runtypes' }
    })
    .forEach(path => {
      hasImportedFromZod = true;
      
      // Create new import from zod
      path.value.source.value = 'zod';
      
      // Fix imported specifiers
      if (path.value.specifiers) {
        path.value.specifiers.forEach(specifier => {
          if (specifier.type === 'ImportSpecifier') {
            // Map runtypes imports to zod equivalents
            const nameMap: Record<string, string> = {
              'String': 'string',
              'Number': 'number',
              'Boolean': 'boolean',
              'Array': 'array',
              'Record': 'object',
              'Literal': 'literal',
              'Union': 'union',
              'Intersect': 'intersection',
              'Optional': 'optional',
              'Null': 'null',
              'Undefined': 'undefined',
              'Tuple': 'tuple',
              'Dictionary': 'record',
              'Unknown': 'unknown',
              'Static': 'infer',
              'Constraint': 'refine',
              'Guard': 'refine',
              'Brand': 'brand'
            };
            
            // Check if a mapping exists for this import
            if (specifier.imported && 'name' in specifier.imported && 
                nameMap[specifier.imported.name as string]) {
              (specifier.imported as Identifier).name = 
                nameMap[(specifier.imported as Identifier).name];
            }
          }
        });
      }
      
      // Add z namespace import if needed
      needsZodNamespace = true;
    });

  // Replace RunType namespace to z
  root
    .find(j.MemberExpression, {
      object: {
        type: 'Identifier',
        name: 'RunType'
      }
    })
    .forEach(path => {
      if ('name' in path.value.object) {
        (path.value.object as Identifier).name = 'z';
      }
    });

  // Transform runtypes usage patterns to zod patterns
  
  // 1. Transform String() to z.string()
  root
    .find(j.CallExpression, {
      callee: {
        type: 'Identifier',
        name: (name: string) => ['String', 'Number', 'Boolean'].includes(name)
      }
    })
    .forEach(path => {
      if (path.value.callee.type === 'Identifier' && 'name' in path.value.callee) {
        const calleeName = (path.value.callee as Identifier).name.toLowerCase();
        path.value.callee = j.memberExpression(
          j.identifier('z'),
          j.identifier(calleeName)
        );
      }
    });

  // 2. Transform Array(Type) to z.array(z.type())
  root
    .find(j.CallExpression, {
      callee: {
        type: 'Identifier',
        name: 'Array'
      }
    })
    .forEach(path => {
      path.value.callee = j.memberExpression(
        j.identifier('z'),
        j.identifier('array')
      );
    });

  // 3. Transform Record({ key: Type }) to z.object({ key: z.type() })
  root
    .find(j.CallExpression, {
      callee: {
        type: 'Identifier',
        name: 'Record'
      }
    })
    .forEach(path => {
      path.value.callee = j.memberExpression(
        j.identifier('z'),
        j.identifier('object')
      );
    });

  // 4. Transform Union to z.union
  root
    .find(j.CallExpression, {
      callee: {
        type: 'Identifier',
        name: 'Union'
      }
    })
    .forEach(path => {
      path.value.callee = j.memberExpression(
        j.identifier('z'),
        j.identifier('union')
      );
      
      // If args are array, transform to tuple
      if (path.value.arguments.length === 1 && 
          path.value.arguments[0].type === 'ArrayExpression') {
        path.value.arguments[0] = j.arrayExpression([
          j.spreadElement(path.value.arguments[0])
        ]);
      }
    });

  // 5. Transform Literal to z.literal
  root
    .find(j.CallExpression, {
      callee: {
        type: 'Identifier',
        name: 'Literal'
      }
    })
    .forEach(path => {
      path.value.callee = j.memberExpression(
        j.identifier('z'),
        j.identifier('literal')
      );
    });

  // 6. Transform .optional() method
  root
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        property: { 
          type: 'Identifier',
          name: 'optional'
        }
      }
    })
    .forEach(path => {
      // Keep as is - both libraries use .optional()
    });

  // 7. Transform validation methods
  root
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        property: { 
          type: 'Identifier',
          name: 'check'
        }
      }
    })
    .forEach(path => {
      if (path.value.callee.type === 'MemberExpression' && 
          'name' in path.value.callee.property) {
        (path.value.callee.property as Identifier).name = 'parse';
      }
    });

  // 8. Replace .validate() with .safeParse()
  root
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        property: { 
          type: 'Identifier',
          name: 'validate'
        }
      }
    })
    .forEach(path => {
      if (path.value.callee.type === 'MemberExpression' && 
          'name' in path.value.callee.property) {
        (path.value.callee.property as Identifier).name = 'safeParse';
      }
      
      // Transform success/failure pattern
      const parentStatement = j(path).closest(j.VariableDeclaration);
      if (parentStatement.length) {
        const declarationName = 
          parentStatement.get().value.declarations[0]?.id?.name;
          
        if (declarationName) {
          // Find usages of .success and .failure in the same block
          root
            .find(j.MemberExpression, {
              object: { 
                type: 'Identifier',
                name: declarationName
              },
              property: {
                type: 'Identifier',
                name: 'success' 
              }
            })
            .forEach(successPath => {
              // Keep as is - both libraries use .success
            });
          
          // Change .failure to !.success
          root
            .find(j.MemberExpression, {
              object: { 
                type: 'Identifier',
                name: declarationName
              },
              property: {
                type: 'Identifier',
                name: 'failure' 
              }
            })
            .forEach(failurePath => {
              j(failurePath).replaceWith(
                j.unaryExpression(
                  '!',
                  j.memberExpression(
                    j.identifier(declarationName),
                    j.identifier('success')
                  )
                )
              );
            });
        }
      }
    });

  // 9. Replace .toString() with .parse()
  root
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        property: { 
          type: 'Identifier',
          name: 'toString'
        }
      },
      arguments: []
    })
    .forEach(path => {
      if (path.value.callee.type === 'MemberExpression' && 
          'name' in path.value.callee.property) {
        (path.value.callee.property as Identifier).name = 'parse';
      }
    });
    
  // Add z namespace import if needed
  if (needsZodNamespace && hasImportedFromZod) {
    // Find the first import statement
    const firstImport = root.find(j.ImportDeclaration).at(0);
    
    if (firstImport.length) {
      // Add z import after the last import
      const lastImport = root.find(j.ImportDeclaration).at(-1);
      
      const zodNamespaceImport = j.importDeclaration(
        [j.importNamespaceSpecifier(j.identifier('z'))],
        j.literal('zod')
      );
      
      if (lastImport.length) {
        lastImport.insertAfter(zodNamespaceImport);
      } else {
        firstImport.insertBefore(zodNamespaceImport);
      }
    }
  }

  return root.toSource();
};

export default transform;