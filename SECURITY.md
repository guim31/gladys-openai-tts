# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration stores nothing in `/data`. Its settings, including the API key,
are kept by Gladys and sent to the container; the key only goes to the
configured server, in the `Authorization` header, and is never logged. The
texts spoken go to that server only: to OpenAI when its address is
`https://api.openai.com/v1`, to your own machine for a local server. The
container only makes outgoing HTTP(S) requests to that address.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the speech servers the integration talks to (Kokoro-FastAPI, LocalAI,
OpenAI…).
