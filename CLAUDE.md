# CLAUDE.md - Development Guidelines

## Commands
- Build: `npm run build`
- Test: `npm test`
- Run codemod test: `npm run test:codemod`
- Run: `npm start <path>`
- Lint: `npm run lint` (add eslint to setup linting)
- Format: `npm run format` (add prettier to setup formatting)

## Code Style
- **Formatting**: Use Prettier with default config
- **Imports**: Group imports (node modules first, then project imports)
- **Types**: Use TypeScript types, avoid any
- **Naming**: camelCase for variables/functions, PascalCase for types/interfaces
- **Error handling**: Use try/catch for error handling, propagate with informative messages
- **Functions**: Keep functions small and focused on a single task
- **Testing**: Write tests for each transformation rule

## Project Structure
- `/src`: Source code for the codemod
- `/__tests__`: Test files
- `/__testfixtures__`: Test fixtures (input/output pairs)