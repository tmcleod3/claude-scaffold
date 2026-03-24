# ADR-001: Provision Resource Manifest

## Status: Accepted (implemented)

## Context

AWS provisioning creates billable cloud resources (EC2 instances, RDS databases, ElastiCache clusters). Currently, the list of created resources lives only in server memory (`Map<runId, ProvisionRun>`). If the VoidForge process crashes mid-provision — or the user closes their terminal — there is no record of what was created and no way to clean up. The user gets billed silently for orphaned resources.

## Decision

Persist a provision manifest to `~/.voidforge/runs/<runId>.json` using a write-ahead log pattern:
1. Before each AWS API call that creates a resource, write the intended action to the manifest
2. After the call succeeds, update the manifest with the resource ID
3. On cleanup, read the manifest and delete resources in reverse order
4. On wizard startup, check for incomplete manifests and offer cleanup

Manifest schema:
```json
{
  "runId": "uuid",
  "startedAt": "ISO8601",
  "target": "vps",
  "region": "us-east-1",
  "projectName": "my-app",
  "status": "in-progress | complete | failed | cleaned",
  "resources": [
    { "type": "key-pair", "id": "my-app-deploy", "status": "created" },
    { "type": "ec2-instance", "id": "i-abc123", "status": "created" }
  ]
}
```

## Consequences

- **Enables:** Crash recovery, `voidforge cleanup` CLI command, audit trail
- **Trade-off:** Adds file I/O on every resource creation (negligible latency vs AWS API calls)
- **Prevents:** Silent billing for orphaned resources

## Alternatives

1. **Store in vault** — Rejected: vault requires password, cleanup should work without it
2. **Store in project dir** — Rejected: project may not exist if creation failed
3. **Don't persist** — Rejected: unacceptable risk of orphaned billing
