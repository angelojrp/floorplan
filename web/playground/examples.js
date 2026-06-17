export const EXAMPLES = {
  apartamento: `version: 1
title: "Apartamento 2 Quartos — Planta Baixa"
scale: 2
wallThickness: 15
grid: 100

rooms:
  - id: sala
    name: Sala de Estar
    x: 0
    y: 0
    width: 550
    height: 420
    doors:
      - wall: south
        offset: 200
        width: 80
        type: pivot
        swing: left
      - wall: north
        offset: 250
        width: 80
        type: pivot
        swing: left
    windows:
      - wall: west
        offset: 60
        width: 200
        height: 120
        sill: 110
      - wall: north
        offset: 100
        width: 180
        height: 120
        sill: 110
  - id: cozinha
    name: Cozinha
    x: 550
    y: 0
    width: 300
    height: 420
    doors:
      - wall: west
        offset: 150
        width: 80
        type: pivot
        swing: right
      - wall: south
        offset: 100
        width: 80
        type: pivot
        swing: left
    windows:
      - wall: east
        offset: 100
        width: 150
        height: 120
        sill: 110
  - id: banheiro
    name: Banheiro
    x: 550
    y: 420
    width: 300
    height: 220
    hatch: diagonal
    doors:
      - wall: north
        offset: 100
        width: 70
        type: pivot
        swing: left
    windows:
      - wall: east
        offset: 60
        width: 80
        height: 80
        sill: 160
  - id: quarto1
    name: Quarto 1
    x: 0
    y: 420
    width: 280
    height: 380
    doors:
      - wall: east
        offset: 160
        width: 80
        type: pivot
        swing: right
    windows:
      - wall: south
        offset: 80
        width: 180
        height: 120
        sill: 110
  - id: quarto2
    name: Quarto 2
    x: 280
    y: 420
    width: 270
    height: 380
    doors:
      - wall: east
        offset: 160
        width: 80
        type: pivot
        swing: right
    windows:
      - wall: south
        offset: 60
        width: 150
        height: 120
        sill: 110`,

  studio: `version: 1
title: "Studio Compacto"
scale: 2
wallThickness: 15
grid: 100

rooms:
  - id: living
    name: Sala/Cozinha Integrada
    x: 0
    y: 0
    width: 450
    height: 550
    doors:
      - wall: south
        offset: 180
        width: 80
        type: pivot
        swing: left
    windows:
      - wall: north
        offset: 80
        width: 200
        height: 120
        sill: 110
      - wall: west
        offset: 150
        width: 120
        height: 120
        sill: 110
  - id: banheiro
    name: Banheiro
    x: 450
    y: 0
    width: 220
    height: 220
    hatch: diagonal
    doors:
      - wall: west
        offset: 70
        width: 70
        type: sliding
        swing: none
    windows:
      - wall: east
        offset: 60
        width: 60
        height: 80
        sill: 160`,

  casa: `version: 1
title: "Casa Pequena"
scale: 2
wallThickness: 15
grid: 100

rooms:
  - id: sala
    name: Sala de Estar
    x: 0
    y: 0
    width: 500
    height: 400
    doors:
      - wall: south
        offset: 200
        width: 100
        type: double
        swing: left
      - wall: east
        offset: 160
        width: 80
        type: pivot
        swing: left
    windows:
      - wall: north
        offset: 80
        width: 250
        height: 120
        sill: 110
      - wall: west
        offset: 100
        width: 150
        height: 120
        sill: 110
  - id: cozinha
    name: Cozinha
    x: 500
    y: 0
    width: 300
    height: 400
    doors:
      - wall: west
        offset: 100
        width: 80
        type: pivot
        swing: right
      - wall: south
        offset: 100
        width: 80
        type: pivot
        swing: left
    windows:
      - wall: east
        offset: 80
        width: 120
        height: 120
        sill: 110
  - id: corredor
    name: Corredor
    x: 200
    y: 400
    width: 600
    height: 120
    hatch: dots
    doors:
      - wall: north
        offset: 60
        width: 80
        type: pivot
        swing: left
      - wall: south
        offset: 160
        width: 80
        type: pivot
        swing: right
      - wall: south
        offset: 360
        width: 80
        type: pivot
        swing: right
  - id: quarto1
    name: Quarto 1
    x: 0
    y: 520
    width: 350
    height: 350
    doors:
      - wall: north
        offset: 120
        width: 80
        type: pivot
        swing: right
    windows:
      - wall: south
        offset: 80
        width: 180
        height: 120
        sill: 110
  - id: quarto2
    name: Quarto 2
    x: 350
    y: 520
    width: 300
    height: 350
    doors:
      - wall: north
        offset: 100
        width: 80
        type: pivot
        swing: right
    windows:
      - wall: south
        offset: 60
        width: 150
        height: 120
        sill: 110
  - id: banheiro
    name: Banheiro
    x: 650
    y: 520
    width: 150
    height: 350
    hatch: diagonal
    doors:
      - wall: north
        offset: 40
        width: 70
        type: pivot
        swing: left
    windows:
      - wall: east
        offset: 80
        width: 60
        height: 80
        sill: 160`,

  comercial: `version: 1
title: "Escritório Comercial"
scale: 2
wallThickness: 15
grid: 100

rooms:
  - id: recepcao
    name: Recepção
    x: 0
    y: 0
    width: 400
    height: 500
    doors:
      - wall: south
        offset: 140
        width: 100
        type: double
        swing: left
      - wall: east
        offset: 200
        width: 80
        type: pivot
        swing: right
    windows:
      - wall: south
        offset: 60
        width: 250
        height: 120
        sill: 110
  - id: reuniao
    name: Sala de Reunião
    x: 400
    y: 0
    width: 350
    height: 350
    doors:
      - wall: west
        offset: 120
        width: 100
        type: double
        swing: right
    windows:
      - wall: north
        offset: 80
        width: 180
        height: 120
        sill: 110
  - id: banheiro
    name: Banheiro
    x: 400
    y: 350
    width: 200
    height: 150
    hatch: diagonal
    doors:
      - wall: west
        offset: 60
        width: 70
        type: pivot
        swing: left
    windows:
      - wall: east
        offset: 50
        width: 60
        height: 80
        sill: 160
  - id: openplan
    name: Open Plan
    x: 600
    y: 350
    width: 250
    height: 300
    doors:
      - wall: west
        offset: 100
        width: 80
        type: pivot
        swing: right
  - id: sala1
    name: Sala Privativa 1
    x: 0
    y: 500
    width: 250
    height: 300
    doors:
      - wall: east
        offset: 100
        width: 80
        type: pivot
        swing: right
    windows:
      - wall: south
        offset: 60
        width: 120
        height: 120
        sill: 110
  - id: sala2
    name: Sala Privativa 2
    x: 250
    y: 500
    width: 250
    height: 300
    doors:
      - wall: east
        offset: 100
        width: 80
        type: pivot
        swing: left
    windows:
      - wall: south
        offset: 60
        width: 120
        height: 120
        sill: 110
  - id: sala3
    name: Sala Privativa 3
    x: 500
    y: 650
    width: 350
    height: 250
    doors:
      - wall: west
        offset: 120
        width: 80
        type: pivot
        swing: right
    windows:
      - wall: east
        offset: 80
        width: 150
        height: 120
        sill: 110`,

  galpao: `version: 1
title: "Galpão Industrial"
scale: 2
wallThickness: 15
grid: 100

rooms:
  - id: armazenagem
    name: Área de Armazenagem
    x: 0
    y: 0
    width: 1300
    height: 900
    doors:
      - wall: south
        offset: 400
        width: 500
        type: sliding
        swing: none
      - wall: south
        offset: 950
        width: 400
        type: sliding
        swing: none
    windows:
      - wall: north
        offset: 300
        width: 600
        height: 120
        sill: 110
  - id: doca
    name: Doca de Carga
    x: 880
    y: 0
    width: 420
    height: 900
    doors:
      - wall: east
        offset: 300
        width: 400
        type: sliding
        swing: none
  - id: escritorio
    name: Escritório Admin
    x: 0
    y: 900
    width: 350
    height: 250
    doors:
      - wall: north
        offset: 100
        width: 80
        type: pivot
        swing: left
    windows:
      - wall: south
        offset: 100
        width: 150
        height: 120
        sill: 110
      - wall: west
        offset: 60
        width: 100
        height: 120
        sill: 110
  - id: banheiro_galpao
    name: Banheiro
    x: 350
    y: 900
    width: 200
    height: 250
    hatch: diagonal
    doors:
      - wall: west
        offset: 60
        width: 70
        type: pivot
        swing: left
    windows:
      - wall: east
        offset: 60
        width: 60
        height: 80
        sill: 160`,

  casa2pav: `version: 1
title: "Casa 2 Pavimentos"
scale: 2
wallThickness: 15
grid: 100

floors:
  - id: terreo
    name: Térreo
    level: 0
    rooms:
      - id: sala
        name: Sala de Estar
        x: 0
        y: 0
        width: 500
        height: 400
        doors:
          - wall: south
            offset: 200
            width: 100
            type: double
            swing: left
          - wall: east
            offset: 160
            width: 80
            type: pivot
            swing: left
        windows:
          - wall: north
            offset: 80
            width: 250
            height: 120
            sill: 110
          - wall: west
            offset: 100
            width: 150
            height: 120
            sill: 110
      - id: cozinha
        name: Cozinha
        x: 500
        y: 0
        width: 300
        height: 400
        doors:
          - wall: west
            offset: 100
            width: 80
            type: pivot
            swing: right
          - wall: south
            offset: 100
            width: 80
            type: pivot
            swing: left
        windows:
          - wall: east
            offset: 80
            width: 120
            height: 120
            sill: 110
      - id: lavabo
        name: Lavabo
        x: 500
        y: 400
        width: 150
        height: 200
        hatch: diagonal
        doors:
          - wall: west
            offset: 60
            width: 70
            type: pivot
            swing: left
      - id: varanda
        name: Varanda
        x: 0
        y: 400
        width: 500
        height: 200
        doors:
          - wall: north
            offset: 200
            width: 100
            type: double
            swing: left
    stairs:
      - id: escada1
        x: 650
        y: 400
        width: 100
        height: 300
        direction: up
        connectsTo: superior
  - id: superior
    name: Pavimento Superior
    level: 1
    rooms:
      - id: quarto1
        name: Quarto 1
        x: 0
        y: 0
        width: 350
        height: 350
        doors:
          - wall: east
            offset: 140
            width: 80
            type: pivot
            swing: right
        windows:
          - wall: south
            offset: 80
            width: 180
            height: 120
            sill: 110
      - id: quarto2
        name: Quarto 2
        x: 350
        y: 0
        width: 300
        height: 350
        doors:
          - wall: west
            offset: 100
            width: 80
            type: pivot
            swing: left
        windows:
          - wall: south
            offset: 60
            width: 150
            height: 120
            sill: 110
      - id: banheiro_sup
        name: Banheiro
        x: 350
        y: 350
        width: 300
        height: 200
        hatch: diagonal
        doors:
          - wall: north
            offset: 100
            width: 70
            type: pivot
            swing: left
        windows:
          - wall: east
            offset: 100
            width: 60
            height: 80
            sill: 160
      - id: corredor_sup
        name: Corredor
        x: 0
        y: 350
        width: 350
        height: 120
        doors:
          - wall: north
            offset: 60
            width: 80
            type: pivot
            swing: left
          - wall: south
            offset: 160
            width: 80
            type: pivot
            swing: right
    stairs:
      - id: escada1_sup
        x: 50
        y: 470
        width: 100
        height: 300
        direction: down
        connectsTo: terreo`
};
