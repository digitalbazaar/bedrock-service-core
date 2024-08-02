# bedrock-service-core ChangeLog

## 10.0.0 - 2024-08-xx

### Changed
- **BREAKING**: Update peer dependencies:
  - `@bedrock/did-context@6`
  - `@bedrock/jsonld-document-loader@5.1.0`
  - `@bedrock/security-context@9`
  - `@bedrock/veres-one-context@16`
- Update minor dependencies.
- Update test dependencies.

## 9.4.0 - 2024-06-15

### Changed
- Use `@digitalbazaar/ed25519-multikey` to resolve ed25519 verification methods.
  No changes to deployments are expected.

## 9.3.0 - 2024-05-20

### Added
- Allow service object config IDs to be provided by a client if the
  extending service code overrides the default validation schema;
  by default, this is still prohibited.

## 9.2.0 - 2024-03-19

### Added
- Surface meter usage check errors during service instance creation.

## 9.1.0 - 2024-02-06

### Added
- Pass existing configuration via `existingConfig` to `validateConfigFn`
  when the `op` is `update`. This feature enables, for example, services
  to check new configs against the existing config to prevent certain
  changes or to carry over defaults.

## 9.0.0 - 2023-09-19

### Changed
- **BREAKING**: Drop support for Node.js < 18.
- Use `@digitalbazaar/ed25519-signature-2020@5`.
- Use `cidr-regex@4`. This version is pure ESM.
- Update peer deps:
  - Use `@bedrock/did-context@5`.
  - Use `@bedrock/jsonld-document-loader@4`.
  - Use `@bedrock/meter-usage-reporter@9`.
  - Use `@bedrock/oauth2-verifier@2`.
  - Use `@bedrock/security-context@8`.
  - Use `@bedrock/veres-one-context@15`.
- Update test deps.

## 8.0.2 - 2023-07-19

### Fixed
- Fix meter usage aggregator function signature.

## 8.0.1 - 2023-05-31

### Fixed
- Ensure that `op` is set to `update` in `validateConfigFn` when called
  during a config update.

## 8.0.0 - 2023-04-18

### Changed
- **BREAKING**: Update peer dep `@bedrock/did-io` to v10.

## 7.1.0 - 2023-04-17

### Added
- Update `validateConfigFn()` error to be thrown as a `BedrockError` so
  that validation error messages may appear in the top level apps instead
  of as unspecified `OperationError`s; `OperationError`s are already
  possible via other error conditions, so this adds a new possible error
  type for app-specific config validation errors.

## 7.0.1 - 2022-10-23

### Fixed
- Fix zcap validation; allow non-required zcaps to be added to configs
  defined by custom services.

## 7.0.0 - 2022-10-20

### Changed
- Use `@bedrock/oauth2-verifier` to provide oauth2 access token
  verification.
- **BREAKING**: Change `supportedAlgorithms` in oauth2 authorization config to
  `allowedAlgorithms` to better reflect proper semantics.

### Removed
- **BREAKING**: Remove `issuerConfig` and from configuration; the same config
  options are now available via `@bedrock/oauth2-verifier`.

## 6.1.2 - 2022-07-17

### Fixed
- Ensure root path in oauth2 scope is treated as full access
  (for given scope `action`) for the targeted service object.

## 6.1.1 - 2022-07-17

### Fixed
- Fix typo in oauth2 scope attenuation checker.

## 6.1.0 - 2022-07-17

### Added
- Enable individual service objects to be configured to support
  OAuth2-based authorization. Adding an
  `authorization.oauth2.issuerConfigUrl` option with the URL to
  the OAuth2 authorization server's well-known metadata URL to
  a service object's config (on creation or via a later update)
  will enable OAuth2-based authz for that service object.

## 6.0.0 - 2022-06-30

### Changed
- **BREAKING**: Require Node.js >=16.
- Use `package.json` `files` field.
- Update dependencies.
- **BREAKING**: Update peer dependencies:
  - `@bedrock/did-io@9`
  - `@bedrock/meter-usage-reporter@8`
  - `@bedrock/zcap-storage@8`
- Lint module.

### Added
- Support IPv6 CIDRs in `ipAllowList`.
  - Switching from `netmask` to `ipaddr.js` to support IPv6.

## 5.1.0 - 2022-05-13

### Added
- Include full error as non-public cause in onError handler.

## 5.0.0 - 2022-04-29

### Changed
- **BREAKING**: Update peer deps:
  - `@bedrock/core@6`
  - `@bedrock/did-context@4`
  - `@bedrock/did-io@8`
  - `@bedrock/express@8`
  - `@bedrock/jsonld-document-loader@3`
  - `@bedrock/meter-usage-reporter@7`
  - `@bedrock/mongodb@10`
  - `@bedrock/security-context@7`
  - `@bedrock/validation@7`
  - `@bedrock/veres-one-context@14`
  - `@bedrock/zcap-storage@7`.

## 4.0.0 - 2022-04-05

### Changed
- **BREAKING**: Rename package to `@bedrock/service-core`.
- **BREAKING**: Convert to module (ESM).
- **BREAKING**: Remove default export.
- **BREAKING**: Require node 14.x.

## 3.1.1 - 2022-03-28

### Fixed
- Fix peer dependency specification (missing `^`) of
  `bedrock-veres-one-context@12`.

## 3.1.0 - 2022-03-14

### Added
- Add missing peer dependencies `bedrock-jsonld-document-loader@1.22`,
  `bedrock-meter-usage-reporter@5.1` and `bedrock-veres-one-context@12.0`.
- Add missing dependency `@digitalbazaar/ed25519-signature-2020` in test.

## 3.0.0 - 2022-03-11

### Added
- Add `config.authorizeZcapInvocationOptions` to allow configuration of
  `authorizeZcapInvocation` middleware in `ezcap-express`.

### Changed
- **BREAKING**: Make default TTL for zcaps 1 year.

## 2.0.0 - 2022-03-01

### Changed
- **BREAKING**: Move zcap revocations to `/zcaps/revocations` to better
  future proof.
- **BREAKING**: Use `@digitalbazaar/ezcap-express@6`.

## 1.0.0 - 2022-02-20

- See git history for changes.
