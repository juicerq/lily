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

Depois da primeira instalação, a extensão se atualiza sozinha. Ela consulta o [`updates.json`](updates.json) deste repositório e baixa o `.xpi` do release mais novo.

Para checar mais vezes que 1× por dia, mude `extensions.update.interval` em `about:config` para `3600` (segundos). Para forçar na hora: `about:addons` → engrenagem → "Procurar atualizações".

## Publicar uma versão

```sh
bun run release          # 0.1.2 → 0.1.3
bun run release minor    # 0.1.2 → 0.2.0
```

O script exige o `main` limpo. Ele sobe a versão, roda as checagens, gera o `.xpi`, cria o release no GitHub e atualiza o `updates.json`.

## Checagens

```sh
bun run check
bun run lint
```
