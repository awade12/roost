# Security policy

## Reporting a vulnerability

Please report vulnerabilities **privately** through GitHub's private vulnerability reporting:
on this repository, go to **Security → Report a vulnerability**. Only the maintainers can see
the report.

Please don't open a public issue, pull request or discussion about a vulnerability before
it's fixed.

A good report includes:

- what an attacker can do, and what they need first (a client key, a dashboard account, …)
- steps to reproduce, or a proof of concept
- the version or commit you tested, and how Roost was deployed

## Scope

In scope:

- **API authentication and sessions:** dashboard sign-in codes, session tokens, `/admin`
  access control, member roles
- **Key handling:** client and server keys (`rk_client_…`, `rk_server_…`), what each key can
  reach, how keys and codes are stored, anything secret that ends up in logs
- **Tenant isolation:** one org, game or environment seeing or changing another's data
  (events, crashes, reports, attachments, flags, AI templates and usage)
- **The SDKs crashing or hanging the game:** `@roost/sdk` and `roost-sdk` must never crash
  the game they're in, whatever the server or network sends back
- Injection, request forgery or path traversal in the API, the worker (minidump and source
  map processing) or the dashboard
- The AI proxy spending past a game's limits, or leaking the OpenRouter key

Out of scope:

- Problems that need an already-compromised server, database or host
- A client key being readable from a shipped game: client keys are public by design; report
  it if one can do more than it should
- Missing hardening headers or rate limits without a concrete impact
- Vulnerabilities in third-party dependencies with no exploitable path in Roost (report those
  upstream)
- Denial of service by sheer traffic volume

## What to expect

- We'll acknowledge the report within a few days.
- We'll confirm whether it's a vulnerability, and keep you posted on the fix.
- Once a fix is released, we'll publish a GitHub security advisory and an entry under
  **Security** in the changelog, and credit you unless you'd rather stay anonymous.

Please give us a reasonable time to fix the issue before disclosing it publicly.

## Supported versions

Roost is pre-1.0. Fixes go into the latest release; please test against it or `main` before
reporting.
