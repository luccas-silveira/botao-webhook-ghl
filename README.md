## Projeto Web em JavaScript + HTML

Estrutura inicial para começar rapidamente:

- `index.html`: página principal.
- `src/main.js`: script base.
- `src/styles.css`: estilos globais.
- `assets/`: pasta para imagens, fontes ou ícones.
- `server.js`: servidor HTTP simples para servir o site e acionar o script `add_contacts_to_workflow.js`.

### Como usar

1. Configure as variáveis `GHL_TOKEN`, `GHL_LOCATION_ID` e `GHL_WORKFLOW_ID` em `assets/.env` (ou no ambiente).
2. Rode o servidor: `node server.js`.
3. Abra `http://localhost:3000` e clique no botão verde para executar `assets/add_contacts_to_workflow.js`. O script lê `assets/created_contacts-test.json` e salva o resultado em `assets/add_to_workflow_results.json`.
4. Ajuste `src/main.js` e `src/styles.css` conforme necessário.
5. Adicione recursos estáticos em `assets/`.

### Próximos passos sugeridos

- Ajustar o título e favicon em `index.html`.
- Criar componentes ou módulos adicionais dentro de `src/`.
- Configurar um servidor de desenvolvimento se precisar de recarga automática.
