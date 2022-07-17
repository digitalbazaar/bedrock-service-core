# bedrock-service-core ChangeLog

## 6.1.2 - 2022-07-xx

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
