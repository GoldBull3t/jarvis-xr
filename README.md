# JARVIS XR — Homelab Command Center

> **Assistente Pessoal de Homelab em Realidade Mista (Meta Quest 3S + Proxmox VE + Home Assistant + Pi-hole/AdGuard + Cosmos Cloud)**  
> *100% Determinístico — Sem LLMs, Sem Modelos Generativos, Sem GPUs de IA.*

---

## 🌟 Visão Geral

O **JARVIS XR** é um centro de operações tridimensional futurista acessível diretamente através do **Meta Quest Browser** nos **Meta Quest 3S** (e compatível com qualquer browser desktop). O sistema permite monitorizar e controlar o Proxmox VE de forma segura, acionar dispositivos do Home Assistant por descoberta automática de etiquetas, verificar o estado do Pi-hole/AdGuard e executar comandos determinísticos por voz em Português de Portugal (`pt-PT`), gestos manuais com *Hand Tracking* ou controladores Touch Plus.

---

## 🚀 Arquitetura Técnica

- **Frontend Espacial:** TypeScript + Three.js + Vite + WebXR Device API (com Passthrough AR a cores, Hand Tracking e mapeamento UV interativo nos hologramas).
- **Backend Seguro:** FastAPI (Python 3.12) + Pydantic v2 + httpx assíncrono (utilizador não-root).
- **CI/CD Automatizado:** GitHub Actions compila automaticamente e publica as imagens prontas no GitHub Container Registry (`ghcr.io`).
- **Opções de Alojamento:**
  - **Cosmos Cloud (Recomendada):** Como ServApp direta com terminação HTTPS automática do Cosmos.
  - **VM Dedicada no Proxmox:** Debian 12 com Docker Engine e Caddy para redes isoladas.
- **Home Assistant 2.0:** Descoberta dinâmica por etiquetas (*Labels* nativas do HA) e sensor de presença em VR para automações de sala real.
- **Proxmox VE 2.0:** Monitorização de nós, CPU/RAM, pools de armazenamento (ZFS/LVM), estado do último backup e controlo seguro de ciclo de vida de VMs autorizadas (Ligar / Desligar limpo por ACPI / Reiniciar).

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
| *"JARVIS, estado da rede"* | Abre o painel de estatísticas DNS / Pi-hole / AdGuard |
| *"JARVIS, mostra os serviços"* | Abre o painel de disponibilidade de serviços locais |
| *"JARVIS, liga a luz do escritório"* | Aciona a entidade autorizada do Home Assistant |
| *"JARVIS, fecha os painéis"* | Recolhe todos os painéis 3D para o núcleo central |
| *"JARVIS, atualiza os dados"* | Força o recarregamento imediato das métricas |
| *"JARVIS, para de ouvir"* | Desativa o reconhecimento vocal |
