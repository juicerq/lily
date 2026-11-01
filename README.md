<img src="public/icon.svg" width="64" height="64" alt="">

# Lily

Extensão para Firefox e Zen: horários bloqueados e cota diária por site.

As regras e decisões estão em [docs/spec.md](docs/spec.md).

## Rodar

```sh
bun install
bun run dev
```

`bun run dev` abre o navegador com um perfil temporário e recarrega a extensão a cada mudança. O binário fica em `web-ext.config.ts`, que não vai para o git.

## Instalar no Zen

O Zen aceita extensões sem assinatura da Mozilla.

1. Em `about:config`, mude `xpinstall.signatures.required` para `false`.
2. Gere o pacote:

   ```sh
   bun run xpi
   ```

3. Em `about:addons`, clique na engrenagem, depois em "Instalar extensão de um arquivo", e escolha `.output/lily.xpi`.

Para atualizar, gere o pacote de novo e instale por cima. A configuração e o uso do dia continuam, porque o ID da extensão é o mesmo.

## Checagens

```sh
bun run check
bun run lint
```
