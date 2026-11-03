# Lily: regras de bloqueio

## Modelo

Uma configuração só: **horários** compartilhados e uma lista de **sites**.

```
Horários (valem para os sites que seguem horários)
  seg–sex 09:00–12:00, 14:00–18:00

Sites            cota/dia     segue horários
  x.com          30m          sim
  youtube.com    1h           sim
  tiktok.com     0m           —          sempre bloqueado
  twitch.tv      30m          não        só cota
```

Um site fica bloqueado quando:

| Motivo | Condição | Libera |
|---|---|---|
| `always` | cota = 0 | nunca |
| `window` | segue horários e agora está numa meia hora pintada | no fim do trecho pintado |
| `quota` | tempo de hoje ≥ cota | 00:00 |

Cota ausente quer dizer sem limite: o site só obedece aos horários.

A página de bloqueio mostra o motivo e o horário em que libera.

## Decisões

| Tema | Decisão |
|---|---|
| Tempo de uso | Conta com a aba ativa da janela em foco. Pausa após 60s sem input, exceto com mídia tocando na aba. |
| Virada do dia | 00:00. A cota zera à meia-noite. |
| Horários | Grade de 7 dias × 48 meias horas. Um trecho que passa da meia-noite continua no dia seguinte. |
| Site | Domínio + subdomínios. `m.youtube.com` conta como `youtube.com`. Bloqueio por caminho fica para depois. |
| Escape | "Liberar 5 min": espera de 30s com a página visível, no máximo 2 vezes por dia, nunca dentro de um horário bloqueado. Global. |
| Aviso | Notificação 1 min antes de um horário começar ou de a cota acabar, se a aba ativa estiver no site. Global. |
| Histórico | Um registro por dia em `storage.local`, chave `day:AAAA-MM-DD`, guardado por 84 dias. Guarda segundos por meia hora de cada site da lista, tempo total por domínio fora da lista, tentativas bloqueadas, liberações, cotas e a linha de horários do dia. |
| Fora da lista | Conta com as mesmas regras de foco e ociosidade, por domínio sem `www.`, sem divisão por meia hora. Não entra em cota nem aparece no extrato. |
| Post isolado | Link de post do X (`/status/<id>`) ou do Instagram (`/p/`, `/reel/`, `/tv/`) mostra "Ver só este post" na tela de bloqueio. O post abre num iframe do embed oficial. Links do embed abrem em aba nova e caem no bloqueio. Não conta tempo nem libera o site. |
| Tentativa | Navegação para um site bloqueado que a Lily redireciona. Mudanças de estado com a aba já aberta não contam. |

## Arquitetura

| Parte | Responsabilidade |
|---|---|
| `background` | Único dono do uso (`usage`). Conta tempo por eventos, agenda alarmes, redireciona abas bloqueadas, notifica. |
| `options` | Único dono da configuração (`config`). Grava direto no `storage.local` a cada mudança. |
| `week` | Página da semana: uso por site, mapa de meias horas, leitura da semana, sites fora da lista e extrato em PNG de 1080 × 1350. Só lê o histórico. Grava a configuração ao pintar um horário ou adicionar um site. |
| `popup` | Só lê. Abre lendo o storage em uma chamada, sem esperar o background. |
| `blocked` | Mostra o motivo e a contagem. Pede o escape ao background por mensagem. Volta sozinha para a URL quando o site libera. Mostra um post do X ou do Instagram pelo embed oficial, sem liberar o site. |
| `lib/rules` | Funções puras: dado config, uso e horário, devolve o estado de cada site. Usadas por todas as partes. |
| `lib/history` | Lê e grava os registros diários. Só o background grava. Apaga registros com mais de 84 dias na primeira gravação de cada dia. |
| `lib/week` | Funções puras que resumem uma semana: totais, dias com cota esgotada, picos fora dos horários, tentativas e domínios fora da lista. |
| `lib/receipt` | Desenha o extrato da semana num canvas. |
| `lib/journal` | Registro em `storage.local.journal`, últimos 300 eventos. Só o background grava: virada do dia, site bloqueado ou liberado, escape, storage inválido. Grava só quando algo muda. |
| `lib/diagnostics` | Monta o relatório que as opções copiam: relógio com fuso, horários, uso, estado de cada site, alarmes e journal, tudo em hora local com offset. |

O background do Firefox MV3 é descarregado quando fica ocioso. Por isso a contagem guarda o início da sessão em `storage.session` e soma o tempo decorrido quando algo muda: troca de aba, foco, ociosidade, alarme de 1 min. A sessão marca se o domínio está na lista. Só o tempo dos sites da lista entra no `usage`; o histórico recebe os dois.
