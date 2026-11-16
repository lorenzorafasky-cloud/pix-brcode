# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-16

### Added

- `createStaticPix`, `createDynamicPix` and `createRecurrencePix` to generate BR Codes, including
  Pix Automático composite QR codes, Pix Saque (`fss`) and `infoAdicional`.
- `parsePix`, `safeParsePix` and `isValidPix` with CRC16 and mandatory field checks.
- Pix key validation and normalization: CPF, CNPJ (numeric and alphanumeric), e-mail, phone and EVP.
- Zero-dependency QR code encoder with SVG, data URL and terminal renderers.
- `pix-brcode` command line tool.
- Tests against every example of the BCB "Manual de Padrões para Iniciação do Pix" v2.10.0.

[0.1.0]: https://github.com/lorenzorafasky-cloud/pix-brcode/releases/tag/v0.1.0
