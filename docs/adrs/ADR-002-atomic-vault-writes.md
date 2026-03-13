# ADR-002: Atomic Vault File Writes

## Status: Accepted (implemented)

## Context

The vault file (`~/.voidforge/vault.enc`) is the single store for all user credentials: API keys, cloud provider secrets, SSH key paths. Currently, vault writes use `writeFile` directly. A power loss, process crash, or disk error during write could leave the file in a corrupted state — zero bytes, partial ciphertext, or garbage. AES-256-GCM's auth tag will detect corruption on the next read, but the data is still lost.

## Decision

Implement write-to-temp-then-rename:
1. Write encrypted data to `vault.enc.tmp` (same directory)
2. Call `fsync` on the file descriptor to ensure data reaches disk
3. Rename `vault.enc.tmp` → `vault.enc` (atomic on all major filesystems)
4. Optionally keep `vault.enc.bak` as the previous generation

This is the standard pattern for safe file updates (used by editors, databases, etc.).

## Consequences

- **Enables:** Crash-safe credential storage, one-generation rollback
- **Trade-off:** Slightly more complex write path, extra file in `~/.voidforge/`
- **Prevents:** Total credential loss from write interruption

## Alternatives

1. **Keep current approach** — Rejected: unacceptable for a credential store
2. **Use SQLite** — Rejected: adds dependency, vault is simple enough for file storage
3. **WAL (write-ahead log)** — Rejected: over-engineering for a key-value store with infrequent writes
