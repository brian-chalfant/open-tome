# Security Policy

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report security issues by emailing the maintainers directly. Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You will receive acknowledgement within 72 hours. We will keep you informed of progress and publicly credit you in the fix unless you prefer to remain anonymous.

## Scope

In scope:
- Authentication bypass or session fixation
- SQL injection or other injection attacks
- XSS in the editor or admin panel
- IDOR (insecure direct object references) on documents or projects
- Privilege escalation (user → admin)

Out of scope:
- Issues requiring physical access to the host
- Social engineering attacks
- Rate limiting on non-sensitive endpoints

## Supported Versions

Only the latest release receives security fixes. Self-hosters are responsible for keeping their instance up to date.
