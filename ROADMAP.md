# 🗺️ Floorplan — Roadmap

Visão: tornar-se a ferramenta mais prática para criar plantas baixas a partir de texto ou visualmente.

---

## 🟢 Fase 1 — Fundação (atual)

- [x] Engine TypeScript (parser YAML, layout, renderer SVG)
- [x] CLI (linha de comando)
- [x] App web com editor YAML + preview live
- [x] Biblioteca de cômodos com inserção
- [x] Drag-and-drop no preview SVG
- [x] Resumo executivo (áreas, estatísticas)
- [x] Suporte a terreno/lote (`lot`)
- [x] Documentação para IA (`docs/AI_GUIDE.md`)
- [x] Licença MIT
- [x] Deploy Cloudflare Pages
- [x] **Visual Editor** (`web/editor.html`) — estilo draw.io
  - [x] Canvas com grid, zoom e pan
  - [x] Drag-drop de cômodos do palette
  - [x] Mover cômodos livremente
  - [x] Redimensionar cômodos (handles)
  - [x] Adicionar portas/janelas clicando na parede
  - [x] Painel de propriedades
  - [x] Exportar YAML e SVG
  - [x] Importar YAML
  - [x] Undo/Redo
  - [x] Snapping ao grid
  - [x] Atalhos de teclado (Delete, Ctrl+Z/Y)

---

## 🟡 Fase 2 — Polimento (curto prazo)

### Visual Editor
- [x] **Snap inteligente**: snap a paredes de outros cômodos (alinhamento automático)
- [ ] **Paredes compartilhadas**: unir automaticamente cômodos adjacentes
- [ ] **Rotação de cômodos**: girar cômodos em ângulos arbitrários
- [x] **Seleção múltipla**: selecionar vários cômodos com Shift+click ou arrastar área
- [x] **Copiar/Colar**: Ctrl+C / Ctrl+V para duplicar cômodos
- [x] **Alinhamento**: alinhar esquerda/direita/topo/base entre cômodos selecionados
- [x] **Mini-map**: visão geral da planta no canto
- [x] **Temas**: dark/light mode no editor visual
- [x] **Touch/mobile**: suporte a gestos touch para tablets
- [x] **Auto-save**: salvar no localStorage automaticamente
- [x] **Indicadores de distância**: mostrar medidas entre cômodos ao mover
- [x] **Tooltips**: ajuda contextual nas ferramentas

### YAML Editor
- [x] Autocomplete/intellisense no CodeMirror (schema YAML)
- [x] Validação em tempo real com mensagens amigáveis
- [x] Quick-fix suggestions (ex: "porta fora da parede — corrigir offset?")

### Engine
- [ ] Paredes em ângulo (não apenas 90°)
- [ ] Paredes curvas
- [ ] Espessura de parede variável por segmento
- [x] Hachuras personalizadas por tipo de cômodo

---

## 🟠 Fase 3 — Profissional (médio prazo)

### Visual Builder Avançado
- [ ] **Ferramenta de parede**: desenhar paredes livremente (linha contínua)
- [ ] **Ferramenta de cômodo**: desenhar retângulo na área desejada
- [ ] **Camadas (layers)**: paredes, portas, janelas, móveis, cotas, texto
- [ ] **Estilos de parede**: alvenaria, drywall, vidro, divisória
- [ ] **Níveis/pavimentos**: múltiplos andares (tabs)
- [ ] **Escadas**: símbolo automático de escada entre pavimentos

### Exportação
- [ ] **DXF**: exportar para AutoCAD/Revit
- [ ] **PDF**: exportar com escala e margens de impressão
- [ ] **Layout de impressão**: múltiplas folhas, carimbo, margens configuráveis
- [ ] **PNG de alta resolução**: exportar imagens raster
- [ ] **Compartilhamento**: gerar link público com preview (hospedagem efêmera)

### Colaboração
- [ ] Multi-usuário em tempo real (WebSocket/CRDT)
- [ ] Comentários/annotations na planta
- [ ] Histórico de versões com diff visual

---

## 🔵 Fase 4 — Ecossistema (longo prazo)

### Biblioteca de Símbolos
- [ ] **Móveis**: sofá, cama, mesa, cadeira, armário, fogão, geladeira, pia
- [ ] **Elétrica**: tomadas, interruptores, luminárias, quadro de luz
- [ ] **Hidráulica**: torneiras, chuveiro, vaso sanitário, tanque
- [ ] **Portas especiais**: porta balcão, porta de correr embutida, porta sanfonada
- [ ] **Símbolos de cota**: cotas internas, níveis, inclinação de telhado
- [ ] **Blocos personalizados**: importar/exportar blocos JSON

### Integrações
- [ ] **API REST**: gerar SVG/JSON via HTTP POST
- [ ] **GitHub Actions**: CI/CD para gerar plantas automaticamente
- [ ] **VS Code Extension**: preview de YAML no editor
- [ ] **Figma Plugin**: importar/exportar entre Figma e Floorplan
- [ ] **Home Assistant**: planta baixa interativa para automação residencial

### Inteligência Artificial
- [ ] **Gerador automático**: "IA, crie um apartamento 2 quartos, 70m²"
- [ ] **Otimizador de layout**: sugerir melhor disposição dos cômodos
- [ ] **Validador normativo**: verificar conformidade com NBR 15575
- [ ] **Estimativa de custo**: calcular área de parede, piso, rodapé
- [ ] **Reconhecimento de imagem**: foto de planta → YAML

---

## 🟣 Fase 5 — Plataforma (visão)

- [ ] **Contas de usuário**: salvar projetos na nuvem
- [ ] **Galeria pública**: compartilhar e descobrir plantas
- [ ] **Templates comunitários**: biblioteca aberta de layouts
- [ ] **White-label**: embed do editor em outros sites
- [ ] **Aplicativo desktop**: Electron app offline
- [ ] **Aplicativo mobile**: editor touch-first para iPad/tablet
- [ ] **Marketplace**: comprar/vender blocos e templates

---

## 📊 Métricas de Sucesso

| Fase | Alvo |
|------|------|
| Fase 2 | Editor visual usável para criar planta completa sem editar YAML |
| Fase 3 | Exportação DXF funcional, multi-pavimento |
| Fase 4 | Biblioteca de móveis com 50+ símbolos, API pública |
| Fase 5 | 1000+ usuários, galeria comunitária ativa |

---

## 🤝 Contribuindo

Este roadmap é aberto. Sugestões são bem-vindas via issues no GitHub.
Veja também [`docs/AI_GUIDE.md`](docs/AI_GUIDE.md) para documentação técnica.
