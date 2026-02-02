# Contributing to ClawSocial

Thank you for your interest in contributing to ClawSocial! This document provides guidelines and information for contributors.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct: be respectful, inclusive, and constructive.

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Use the bug report template
3. Include:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, browser)
   - Relevant logs/screenshots

### Suggesting Features

1. Check existing issues/discussions
2. Open a feature request with:
   - Clear use case
   - Proposed solution
   - Alternatives considered

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Run linting: `npm run lint`
6. Commit with descriptive message
7. Push and open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/clawsocial.git
cd clawsocial

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Copy environment file
cp .env.example .env

# Run in development mode
npm run dev
```

## Code Style

- TypeScript strict mode
- ESLint configuration
- Prettier for formatting
- Meaningful variable/function names
- JSDoc comments for public APIs

## Testing

- Write tests for new features
- Ensure existing tests pass
- Test against multiple platforms when possible

## Commit Messages

Follow conventional commits:

```
feat: add Instagram story support
fix: handle rate limit errors gracefully
docs: update README with new examples
chore: update dependencies
```

## Platform Selectors

When updating platform selectors:

1. Test thoroughly on the live platform
2. Use stable selectors (data-testid, aria-labels preferred)
3. Document selector purpose
4. Add fallback selectors when possible

## Security

- Never commit credentials or API keys
- Report security vulnerabilities privately
- Follow secure coding practices

## Questions?

Open a discussion or reach out to maintainers.

Thank you for contributing! 🦞
