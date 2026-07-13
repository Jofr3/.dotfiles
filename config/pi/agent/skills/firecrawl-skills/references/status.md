# `firecrawl_status`

Call with an empty argument object:

```json
{}
```

It is non-initializing and network-free. It returns:

- client state (`initialized` or `not initialized`);
- locked SDK version (`firecrawl@4.30.0`);
- booleans for current API-key and custom-base-URL presence;
- detail booleans indicating whether an existing client was initialized with those values.

It never returns the credential or endpoint value. It does not validate authentication, endpoint syntax/connectivity, service health, quota, or account readiness. A not-initialized state is normal before the first network-capable tool call.

If configuration changed after initialization, instruct the user to update the environment that launches Pi and use `/reload`. Never request that a key be pasted into chat or passed to a Firecrawl tool. See [setup and safety](setup-safety-and-output.md).
