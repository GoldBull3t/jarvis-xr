# JARVIS XR — Homelab Command Center

> **Assistente Pessoal de Homelab em Realidade Mista (Meta Quest 3S + Proxmox VE + Home Assistant + Pi-hole/AdGuard + Cosmos Cloud)**  
> *100% Determinístico — Sem LLMs, Sem Modelos Generativos, Sem GPUs de IA.*

---

## 🌟 Visão Geral

O **JARVIS XR** é um centro de operações tridimensional futurista acessível diretamente através do **Meta Quest Browser** nos **Meta Quest 3S** (e compatível com qualquer browser desktop). O sistema permite monitorizar e controlar o Proxmox VE de forma segura, acionar dispositivos do Home Assistant por descoberta automática de etiquetas, verificar o estado do Pi-hole/AdGuard e executar comandos determinísticos por voz em Português de Portugal (`pt-PT`), gestos manuais com *Hand Tracking* ou controladores Touch Plus.

---

## 🚀 Arquitetura Técnica & Os 4 Pilares do JARVIS XR

O JARVIS XR opera sobre 4 pilares fundamentais concebidos para máxima robustez e zero dependência de modelos de inteligência artificial ou GPUs dedicadas:

1. **Pilar 1 — Execução Vocal Determinística & Motor Dinâmico de Entidades:**
   - Reconhecimento vocal determinístico local em `pt-PT` através da Web Speech API.
   - Motor dinâmico de correspondência fonética e tokenização: aciona qualquer luz, tomada, estore, climatização ou reprodutor descoberto pelo nome amigável, além de gerir máquinas do Proxmox por VMID (ex: *"JARVIS, liga a máquina 100"*).
   - Efeitos sonoros táticos sintetizados proceduralmente via Web Audio API (sem dependência de ficheiros externos).

2. **Pilar 2 — Interação Espacial 3D & Painel de Vigilância (Meta Quest 3S):**
   - Agarrar e mover painéis no espaço tridimensional (*Spatial Panel Grabbing*): utilizando os controladores Touch Plus (Grip ou gatilho no cabeçalho) ou pinch com Hand Tracking, arraste e fixe os painéis onde desejar na sua sala em Passthrough AR a cores.
   - Painel de Vigilância 3D: visualização em tempo real de snapshots JPEG de câmaras do Home Assistant com timestamp e atalhos rápidos.

3. **Pilar 3 — Telemetria em Tempo Real sem Polling (Server-Sent Events - SSE):**
   - Canal contínuo SSE (`/api/stream/events`) que transmite atualizações instantâneas do Proxmox e Home Assistant assim que ocorrem variações de estado.
   - Desconexão e reconexão automática resiliente ao entrar ou sair de suspensão no headset.

4. **Pilar 4 — Central Avançada de Diagnóstico & Latência do Homelab:**
   - Bateria de testes concorrentes de latência (ms) para Proxmox VE, Home Assistant, Pi-hole/AdGuard e resolução DNS interna.
   - Deteção e comutação transparente entre domínio local e IP de fallback (`HOME_ASSISTANT_FALLBACK_URL`).
   - Painel dedicado na interface e via voz para inspecionar a saúde da infraestrutura.

---

## 📁 Estrutura do Repositório

```text
jarvis-xr/
├── .github/workflows/          # CI/CD: Compilação e publicação automática no GHCR
│   └── docker-build.yml
├── docker-compose.yml          # Definição multi-contentor local (Frontend + Backend + Caddy)
├── .env.example                # Modelo de configuração e segredos
├── .gitignore                  # Exclusão estrita de segredos e dependências
├── README.md                   # Documentação principal
├── docs/                       # Guias detalhados de implementação e suporte
│   ├── architecture.md         # Diagramas e princípios de design
│   ├── installation.md         # Provisionamento da VM Debian 12 no Proxmox
│   ├── integrations.md         # Guia oficial de Home Assistant, Proxmox e DNS
│   ├── quest-setup.md          # Configuração WebXR, Passthrough e HTTPS no Quest 3S
│   ├── security.md             # Modelo de segurança, isolamento e allowlists
│   ├── commands.md             # Catálogo de voz determinístico e transparência de privacidade
│   └── troubleshooting.md      # Resolução de problemas, procedimentos de backup e atualização
├── deploy/
│   ├── cosmos-compose.yml      # Compose pré-configurado pronto para o Cosmos Cloud ServApps
│   ├── Caddyfile               # Configuração do proxy reverso HTTPS alternativo
│   └── scripts/
│       ├── setup-vm.sh         # Script de instalação de Docker e firewall na VM
│       └── validate.sh         # Script de validação automática de saúde e testes
├── homeassistant-integration/  # Componente nativo para o Home Assistant (HACS / custom_components)
│   ├── custom_components/jarvis_xr/
│   └── README.md
├── backend/                    # Backend FastAPI (Python 3.12, Sem IA/LLM)
│   ├── Dockerfile              # Imagem leve baseada em python:3.12-slim-bookworm
│   ├── requirements.txt        # Dependências FastAPI e Pydantic
│   ├── app/                    # Código modular (rotas, adaptadores, segurança)
│   └── tests/                  # Testes automatizados com pytest
└── frontend/                   # Aplicação Espacial 3D (Three.js, WebXR, Vite, TypeScript)
    ├── Dockerfile              # Multi-stage build Node 22 -> Nginx Alpine
    ├── nginx.conf              # Servidor estático com headers WebXR e proxy de API
    └── src/                    # Código-fonte (Three.js, WebXR, HUD, Voz)
```

---

## ⚡ Guia Rápido de Instalação

### Opção A: No Cosmos Cloud (Mais Rápido & Sem VM Nova)
1. Faz o push do repositório para o teu GitHub: `git push -u origin main`.
2. O GitHub Actions compila e gera as imagens no teu `ghcr.io`.
3. No **Cosmos Cloud**, cria uma nova ServApp com o ficheiro [`deploy/cosmos-compose.yml`](deploy/cosmos-compose.yml).
4. No Cosmos Cloud, vai a **URLs > New URL** e aponta para o contentor `jarvis-frontend` (porta 80).
5. O Cosmos gera o certificado HTTPS automaticamente para o Meta Quest 3S!

### Opção B: Numa VM Dedicada no Proxmox
1. Cria a VM Debian 12 no Proxmox (2 vCPUs, 2 GB RAM).
2. Clona o repositório: `git clone https://github.com/GoldBull3t/jarvis-xr.git /opt/jarvis-xr`.
3. Executa o provisionamento: `sudo bash deploy/scripts/setup-vm.sh`.
4. Copia o ficheiro de ambiente: `cp .env.example .env` e preenche os teus tokens.
5. Inicia com Docker Compose: `docker compose up -d --build`.

---

## 🎙 Catálogo de Comandos de Voz Determinísticos

| Frase Reconhecida | Ação Executada |
|---|---|
| *"JARVIS, mostra a casa"* | Abre o painel holográfico da Domótica |
| *"JARVIS, mostra os servidores"* | Abre o painel do Proxmox VE com CPU/RAM/Storage |
| *"JARVIS, mostra a câmara"* | Abre o painel holográfico de vigilância e câmara 3D |
| *"JARVIS, diagnóstico do sistema"* | Abre o painel de diagnóstico e executa testes de latência |
| *"JARVIS, estado da rede"* | Abre o painel de estatísticas DNS / Pi-hole / AdGuard |
| *"JARVIS, mostra os serviços"* | Abre o painel de disponibilidade de serviços locais |
| *"JARVIS, liga a luz do escritório"* | Aciona a entidade autorizada do Home Assistant |
| *"JARVIS, liga a máquina 100"* | Inicia a VM especificada no Proxmox VE |
| *"JARVIS, fecha os painéis"* | Recolhe todos os painéis 3D para o núcleo central |
| *"JARVIS, atualiza os dados"* | Força o recarregamento imediato das métricas |
| *"JARVIS, para de ouvir"* | Desativa o reconhecimento vocal |
