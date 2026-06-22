# Contributing to Tome

## Getting started

1. Fork the repo and create a branch: `git checkout -b feature/my-thing`
2. Follow the dev setup in README.md
3. Make your changes, run tests, open a PR

## Branch naming

| Type | Pattern |
|---|---|
| Feature | `feature/short-description` |
| Bug fix | `fix/short-description` |
| Docs | `docs/short-description` |

## Commit format

```
type: short description (max 72 chars)

Optional body explaining why, not what.
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

## Tests

```bash
# Server
cd server && npm test

# Client
cd client && npm test
```

All tests must pass before a PR can be merged.

## Linting

```bash
cd server && npm run lint
cd client && npm run lint
```

## Pull requests

- Keep PRs focused — one feature or fix per PR
- Update relevant docs if the change affects user-facing behavior
- Fill out the PR template checklist
- Link to an issue if one exists

## Code style

- No comments explaining *what* code does — only the *why* when non-obvious
- No half-finished implementations
- No backwards-compatibility hacks for code that has no users yet

## Reporting bugs

Use the GitHub issue tracker with the bug report template.
