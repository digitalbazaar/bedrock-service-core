# bedrock-service-core ChangeLog

## 4.0.0 - 2022-04-xx

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
