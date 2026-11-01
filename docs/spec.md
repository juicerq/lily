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

## Arquitetura

| Parte | Responsabilidade |
|---|---|
| `background` | Único dono do uso (`usage`). Conta tempo por eventos, agenda alarmes, redireciona abas bloqueadas, notifica. |
| `options` | Único dono da configuração (`config`). Grava direto no `storage.local` a cada mudança. |
| `popup` | Só lê. Abre lendo o storage em uma chamada, sem esperar o background. |
| `blocked` | Mostra o motivo e a contagem. Pede o escape ao background por mensagem. Volta sozinha para a URL quando o site libera. |
| `lib/rules` | Funções puras: dado config, uso e horário, devolve o estado de cada site. Usadas por todas as partes. |

O background do Firefox MV3 é descarregado quando fica ocioso. Por isso a contagem guarda o início da sessão em `storage.session` e soma o tempo decorrido quando algo muda: troca de aba, foco, ociosidade, alarme de 1 min.
