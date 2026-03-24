# ADR-014: S3 Deploy via SDK, Not AWS CLI

## Status: Accepted

## Context
The S3 Static provisioner generates `deploy-s3.sh` which uses `aws s3 sync` (requires AWS CLI). v3.8.0 needs to actually upload files, not just generate the script.

Two options: shell out to `aws s3 sync` (requires AWS CLI installed) or use `@aws-sdk/client-s3` (already a dependency).

## Decision
Use `@aws-sdk/client-s3` directly for file upload in a new `wizard/lib/s3-deploy.ts` module. Walk the build directory, upload each file with correct Content-Type and Cache-Control headers, delete stale files. The generated `deploy-s3.sh` script is still written for future manual deploys.

## Consequences
- No AWS CLI dependency for automated deploys
- More code (~80 lines) than a shell-out, but fully testable and cross-platform
- MIME type detection needed (use file extension mapping, not a dependency)
- Multipart upload not needed for typical static sites (files < 5GB)

## Alternatives
1. **Shell out to AWS CLI:** Rejected — adds binary dependency, not always installed
2. **Use @aws-sdk/lib-storage Upload:** Considered but overkill for static site files (all < 100MB)
