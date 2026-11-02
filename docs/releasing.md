# Publicação

Comandos executados na raiz do repositório. Releases exigem Bun, Git e GitHub CLI autenticado com acesso de escrita.

## Publicar uma versão

```sh
bun run release
bun run release minor
```

O script exige o `main` limpo. Ele sobe a versão, roda as checagens, gera o `.xpi`, cria o release no GitHub e atualiza o `updates.json`.

Com as chaves do AMO no `.env`, o mesmo comando também envia a versão para a loja.

## Loja do Firefox (AMO)

```sh
bun run amo
```

O script gera a build da loja com `LILY_AMO=1`, que tira o `update_url` do manifest. Depois ele envia o pacote, o código-fonte e os textos de [`amo/metadata.json`](../amo/metadata.json) com `web-ext sign`.

As chaves ficam no `.env`, que não vai para o git:

```sh
WEB_EXT_API_KEY=user:12345:67
WEB_EXT_API_SECRET=...
```

Gere as chaves em https://addons.mozilla.org/developers/addon/api/key/.

### Build para revisores

1. Instale o Bun 1.4 ou mais novo.
2. `bun install --frozen-lockfile`
3. `LILY_AMO=1 bun run build`

O resultado fica em `.output/firefox-mv3`.
