module.exports = function transform(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  // Replace runtypes with zod
  root
    .find(j.Literal, { value: 'runtypes' })
    .replaceWith(j.stringLiteral('zod'));

  // Add z namespace import
  const hasImports = root.find(j.Literal, { value: 'zod' }).length > 0;
  
  if (hasImports) {
    // Check if z is already defined
    const hasZNamespace = root.find(j.VariableDeclarator, {
      id: {
        name: 'z'
      }
    }).length > 0;
    
    // Only add if not already defined
    if (!hasZNamespace) {
      // Add z import for require style
      const requireStatements = root.find(j.VariableDeclaration, {
        declarations: [{
          init: {
            type: 'CallExpression',
            callee: {
              name: 'require'
            }
          }
        }]
      });
      
      if (requireStatements.length) {
        const lastRequire = requireStatements.at(-1);
        const zodNamespaceRequire = j.variableDeclaration('const', [
          j.variableDeclarator(
            j.identifier('z'),
            j.callExpression(
              j.identifier('require'),
              [j.stringLiteral('zod')]
            )
          )
        ]);
        
        lastRequire.insertAfter(zodNamespaceRequire);
      }
    }
  }

  // Transform String() to z.string(), etc.
  const typeMap = {
    'String': 'string',
    'Number': 'number',
    'Boolean': 'boolean'
  };
  
  Object.keys(typeMap).forEach(typeName => {
    root
      .find(j.CallExpression, {
        callee: {
          type: 'Identifier',
          name: typeName
        }
      })
      .replaceWith(path => 
        j.callExpression(
          j.memberExpression(
            j.identifier('z'),
            j.identifier(typeMap[typeName])
          ),
          path.value.arguments
        )
      );
  });

  // Transform Array() to z.array()
  root
    .find(j.CallExpression, {
      callee: {
        type: 'Identifier',
        name: 'Array'
      }
    })
    .replaceWith(path => 
      j.callExpression(
        j.memberExpression(
          j.identifier('z'),
          j.identifier('array')
        ),
        path.value.arguments
      )
    );

  // Transform Record() to z.object()
  root
    .find(j.CallExpression, {
      callee: {
        type: 'Identifier',
        name: 'Record'
      }
    })
    .replaceWith(path => 
      j.callExpression(
        j.memberExpression(
          j.identifier('z'),
          j.identifier('object')
        ),
        path.value.arguments
      )
    );
    
  // Replace method calls
  root
    .find(j.MemberExpression, {
      property: {
        name: 'check'
      }
    })
    .forEach(path => {
      path.value.property.name = 'parse';
    });
    
  root
    .find(j.MemberExpression, {
      property: {
        name: 'validate'
      }
    })
    .forEach(path => {
      path.value.property.name = 'safeParse';
    });
    
  // Replace result.failure with !result.success
  root
    .find(j.MemberExpression, {
      property: {
        name: 'failure'
      }
    })
    .replaceWith(path => 
      j.unaryExpression(
        '!',
        j.memberExpression(
          path.value.object,
          j.identifier('success')
        )
      )
    );

  // Rename destructured imports
  root
    .find(j.ImportSpecifier)
    .forEach(path => {
      const oldName = path.value.imported.name;
      if (typeMap[oldName]) {
        path.value.imported.name = typeMap[oldName];
      } else if (oldName === 'Record') {
        path.value.imported.name = 'object';
      } else if (oldName === 'Array') {
        path.value.imported.name = 'array';
      }
    });
    
  // Rename require destructuring
  root
    .find(j.ObjectPattern)
    .forEach(path => {
      path.value.properties.forEach(prop => {
        if (prop.key && prop.key.type === 'Identifier') {
          const oldName = prop.key.name;
          if (typeMap[oldName]) {
            prop.key.name = typeMap[oldName];
          } else if (oldName === 'Record') {
            prop.key.name = 'object';
          } else if (oldName === 'Array') {
            prop.key.name = 'array';
          }
        }
      });
    });

  return root.toSource();
};