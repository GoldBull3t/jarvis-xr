# JARVIS XR — Configuração no Meta Quest 3S & WebXR

Este documento orienta a ligação, calibração espacial e interação imersiva com os Meta Quest 3S utilizando o **Meta Quest Browser**.

---

## 1. Requisito Fundamental: Contexto Seguro (HTTPS)

O motor Chromium do Meta Quest Browser exige **HTTPS** para autorizar:
- `WebXR Device API` (`immersive-ar` / `immersive-vr`)
- `WebXR Hand Input API` (tracking articulado das mãos)
- `Web Speech API` (reconhecimento vocal por microfone)
- `getUserMedia` (acesso aos sensores de áudio)

### Opção A: Cosmos Cloud (Recomendada)
1. Crie o URL da ServApp no seu painel do **Cosmos Cloud** (ex.: `https://jarvis.meuhomelab.com`).
2. O Cosmos Cloud emite automaticamente um certificado Let's Encrypt com autoridade pública reconhecida.
3. **Resultado:** O Meta Quest 3S aceita a ligação imediatamente sem qualquer aviso ou necessidade de instalar certificados CA no headset.

### Opção B: CA Interna do Caddy (`tls internal`)
Se estiver a correr a VM dedicada com o Caddy em rede isolada:
1. O Caddy gera um certificado raiz em `/data/caddy/pki/authorities/local/root.crt`.
2. Extraia o ficheiro:
   ```bash
   docker compose cp jarvis-proxy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
   ```
3. Instale o certificado no Quest 3S via SideQuest ou ADB:
   ```bash
   adb push caddy-root.crt /sdcard/Download/
   ```
   No headset: vá a **Definições > Segurança > Instalar certificados de CA** e selecione o ficheiro.

---

## 2. Acesso à Interface e Calibração Espacial

1. Coloque os Meta Quest 3S e assegure-se de que a delimitação da divisão (*Boundary / Guardian*) está ativa.
2. Abra a aplicação **Meta Quest Browser**.
3. Na barra de endereço, introduza o endereço HTTPS configurado.
4. Clique no botão inferior **INICIAR SESSÃO AR (PASSTHROUGH)**.
5. Autorize as permissões de câmara, microfone e tracking de mãos quando solicitado.

---

## 3. Disposição Espacial dos Hologramas (Arco Ergonómico)

A interface JARVIS XR posiciona os elementos no espaço 3D real da sala:

- **Núcleo Central JARVIS:** Posição `(0, 0, -2.0m)` — Centro visual de telemetria, pulsação e estado do sistema.
- **Painel Domótica (Home Assistant):** Posição `(-1.4m, +0.05m, -1.8m)` rodado `+20°` à esquerda.
- **Painel Virtualização (Proxmox VE):** Posição `(+1.4m, +0.05m, -1.8m)` rodado `-20°` à direita.
- **Painel Rede & DNS Shield:** Posição `(0.0m, +1.05m, -1.9m)` ligeiramente elevado ao centro.

---

## 4. Métodos de Interação

### 4.1. Hand Tracking (Mãos Virtuais 3D)
- O sistema utiliza a `XRHandModelFactory` para renderizar as mãos e articulações virtuais em tempo real.
- **Apontar:** O raio laser virtual (`Line3D` ciano) projeta-se a partir da mão dominante.
- **Gesto de Pinçar (Pinch):** Una a ponta do indicador com a ponta do polegar para acionar botões nos painéis holográficos.
- O retículo circular projeta-se com precisão sobre o ponto exato da superfície do painel.

### 4.2. Controladores Meta Quest Touch Plus
- **Gatilho (*Trigger*):** Seleciona ou prime botões nos painéis 3D.
- **Feedback Háptico:** O controlador emite uma vibração subtil de 40ms ao confirmar a seleção de botões ou interruptores.
- **Modelos 3D:** Os modelos dos comandos Touch Plus são renderizados via `XRControllerModelFactory`.

### 4.3. Mapeamento Interativo de Coordenadas UV
- Cada clique do laser calcula as coordenadas UV de interseção `(u, v)` no plano 3D.
- As coordenadas são convertidas em píxeis `(x, y)` no canvas interno do painel:
  - Botão fechar `[✕]`: recolhe o painel individual.
  - Botão `[💡 LUZ ESCRITÓRIO]`: alterna a entidade autorizada.
  - Botão `[⟳ ATUALIZAR MÉTRICAS]`: força um novo ciclo de telemetria com o backend.

---

## 5. Automação de Presença no Headset ("Stark Workshop")

Ao entrar e sair da sessão WebXR, o JARVIS XR notifica o Home Assistant em tempo real:
- **Entrada em VR/AR:** Ativa `binary_sensor.jarvis_xr_active` e dispara o evento `jarvis_xr_presence` com `active: true`.
- **Saída de VR/AR:** Desativa o sensor e dispara `active: false`.
- Permite que a iluminação da sua sala física reaja automaticamente à utilização do headset!

---

## 6. Checklist de Validação no Headset

- [x] O browser deteta suporte a `immersive-ar` ou `immersive-vr` através de `navigator.xr.isSessionSupported()`.
- [x] Ao entrar em modo AR, o fundo torna-se transparente e o Passthrough a cores do Quest 3S exibe a sala real.
- [x] Os painéis 3D flutuam fixos a distâncias confortáveis (~1.8m), sem vibrações ou deriva visual.
- [x] O raio laser aponta e destaca áreas interativas dos painéis com retículo de colisão.
- [x] O gesto de pinçar (*pinch*) ou o gatilho dos comandos executa a ação correta no painel 3D.
- [x] A voz em português (`pt-PT`) funciona sem atrasos e com confirmação falada.
