# Contribuindo / Contributing

Obrigado pelo interesse! Issues e pull requests são bem-vindos, em português ou inglês.
Thanks for your interest! Issues and pull requests are welcome, in Portuguese or English.

## Ambiente / Setup

```bash
npm install
npm test           # vitest
npm run typecheck  # tsc
npm run build      # dist/
```

## Regras / Guidelines

- **Siga o manual do BCB.** Toda regra de negócio deve citar a seção do
  [Manual de Padrões para Iniciação do Pix](https://www.bcb.gov.br/estabilidadefinanceira/pix)
  (ou do Manual do BR Code / EMV QRCPS) que a justifica.
  Every rule should point to the section of the BCB manual (or EMV QRCPS) behind it.
- **Testes primeiro.** Bugs vêm com um teste que falha antes da correção. Exemplos oficiais
  ficam em `test/vectors.ts`. / Bug fixes come with a failing test.
- **Sem dependências de runtime.** / No runtime dependencies.
- **Sem segredos ou dados reais.** Use chaves e documentos de exemplo (como os do manual).
  / Never commit real keys, documents or credentials.

## Relatando problemas / Reporting issues

Inclua o BR Code (com dados fictícios), o resultado esperado e o obtido. Se um app de banco
rejeita um código gerado pela biblioteca, diga qual app e a mensagem de erro.
Include the BR Code (with fake data), expected and actual results. If a bank app rejects a
generated code, say which app and the error message.
