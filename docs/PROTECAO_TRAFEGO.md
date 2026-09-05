# Proteção contra tráfego automatizado

Notas para quando o volume de acessos cresce sem crescimento equivalente de
uso real — o caso típico é um pico concentrado num país só, com sessões de
uma página e zero interação.

## Antes de bloquear: separar robô de gente

O site é servido por Cloudflare Pages e a API por um Worker, então os dados
já existem no painel:

- **Analytics & Logs → Traffic** filtrado por país mostra a distribuição real
  de requisições (não só de páginas HTML).
- **Security → Events** mostra o que já foi desafiado/bloqueado e qual regra
  pegou.
- Coluna **Bot score** nos eventos: abaixo de 30 é quase certamente
  automatizado.

Vale olhar antes de agir porque nem todo robô é hostil: buscadores, o
Googlebot, monitores de uptime e agentes de IA usando `POST /render` são uso
esperado — este projeto existe para ser chamado por agentes.

## O que está no código

`api/ratelimit.ts` aplica limite de taxa por IP nas rotas públicas, usando o
binding `[[ratelimits]]` do Workers (contagem na borda, sem escrita em D1 —
um limitador que grava no banco a cada requisição vira ele mesmo o alvo):

| Bucket      | Rota            | Limite         |
| ----------- | --------------- | -------------- |
| `RL_RENDER` | `POST /render`  | 30 / min / IP  |
| `RL_PUBLIC` | `/api/*`        | 120 / min / IP |

Estourar devolve `429` com `Retry-After`. O limite de `/api/*` roda **antes**
da verificação de sessão, para que uma enxurrada não vire custo de Clerk e de
D1 a cada requisição.

`POST /render` também recusa corpo acima de 64 KB (`413`): uma planta real
cabe em poucos KB, e sem teto qualquer um gasta CPU do Worker mandando
megabytes.

Ajustar os limites: editar `simple = { limit, period }` em
`api/wrangler.toml` (o `period` só aceita 10 ou 60) e rodar
`npm run deploy:worker`. Sem os bindings — `wrangler dev` sem config, testes
da engine — o Worker roda como antes, sem limite.

Deliberadamente **não** bloqueamos por User-Agent: trocar o UA é uma linha de
código, e a lista de UAs legítimos inclui justamente os agentes que devem
usar a API.

## O que só dá para fazer no painel

O código do Worker só vê o que chega até ele. Filtrar antes disso — inclusive
o tráfego que atinge o site estático, onde não há Worker nenhum — é
configuração no dashboard da Cloudflare, no domínio:

1. **Bot Fight Mode** (Security → Bots). Grátis, pega a maior parte dos
   scripts genéricos. Primeira coisa a ligar.
2. **Rate limiting rule** (Security → WAF → Rate limiting rules) para o
   site estático, ex.: mais de 100 requisições em 1 min do mesmo IP em `/*`
   → *Managed Challenge*. Desafio, não bloqueio: um usuário real passa sem
   perceber.
3. **Regra por país**, se o padrão persistir e não houver público-alvo lá:
   `(ip.geoip.country eq "SA")` → *Managed Challenge*. Preferir desafio a
   `Block` — bloqueio por país derruba VPNs e visitantes legítimos, e não
   custa nada ao atacante trocar de saída.
4. **Regra por bot score**: `(cf.bot_management.score lt 30 and not
   cf.bot_management.verified_bot)` → *Managed Challenge*. Mais preciso que
   geografia, porque mira o comportamento e não a origem.

Regras de WAF valem para o domínio inteiro, então cobrem Pages e Worker de
uma vez, e são revertíveis num clique — dá para ligar, observar as métricas
por um ou dois dias e ajustar.

## Se o objetivo é só limpar a métrica

Quando o tráfego não custa nada (site estático, cache da Cloudflare) e o
incômodo é o número inflado, o caminho é medir melhor em vez de bloquear:
Cloudflare Web Analytics já descarta boa parte dos robôs, e o painel de
Pages conta requisições cruas — são números diferentes por construção.
