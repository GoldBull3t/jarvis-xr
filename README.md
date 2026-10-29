# JARVIS XR — Homelab Command Center

> **Assistente Pessoal de Homelab em Realidade Mista (Meta Quest 3S + Proxmox VE + Home Assistant + Pi-hole/AdGuard)**  
> *100% Determinístico — Sem LLMs, Sem Modelos Generativos, Sem GPUs de IA.*

---

## 🌟 Visão Geral

O **JARVIS XR** é um centro de operações tridimensional futurista acessível diretamente através do **Meta Quest Browser** nos **Meta Quest 3S** (e compatível com qualquer browser desktop). O sistema permite monitorizar o Proxmox VE, controlar entidades selecionadas do Home Assistant, verificar o estado do Pi-hole/AdGuard e executar comandos determinísticos por voz em Português de Portugal (`pt-PT`) ou gestos manuais.

---

## 🚀 Arquitetura Técnica

- **Frontend:** TypeScript + Three.js + Vite + WebXR Device API (com suporte a Passthrough e Hand Tracking).
- **Backend:** FastAPI (Python 3.12) + Pydantic v2 + httpx assíncrono.
- **Proxy Seguro:** Caddy v2 com terminação TLS automática (HTTPS/WSS) essencial para WebXR e Web Speech API.
- **Isolamento:** Docker Compose com contentores separados em rede privada (`jarvis-net`) sob utilizadores não-root.

---

## 📁 Estrutura do Repositório

```text
jarvis-xr/
├── docker-compose.yml          # Definição multi-contentor dos serviços
├── .env.example                # Modelo de configuração e segredos
├── .gitignore                  # Exclusão estrita de segredos e dependências
├── README.md                   # Documentação principal
├── docs/                       # Guias detalhados
│   ├── architecture.md         # Diagramas e princípios de design
│   ├── installation.md         # Provisionamento da VM Debian 12 no Proxmox
│   ├── quest-setup.md          # Configuração WebXR e HTTPS no Meta Quest 3S
│   └── security.md             # Controlo de permissões e segurança
├── deploy/
│   ├── Caddyfile               # Configuração do proxy reverso HTTPS
│   └── scripts/
│       ├── setup-vm.sh         # Script de instalação de Docker e firewall na VM
│       └── validate.sh         # Script de validação automática de saúde e testes
├── backend/
│   ├── Dockerfile              # Imagem Python 3.12 slim não-root
│   ├── requirements.txt        # Dependências FastAPI e Pydantic
│   ├── pyproject.toml          # Configuração do pytest
│   ├── app/
│   │   ├── main.py             # Ponto de entrada FastAPI e CORS
│   │   ├── config.py           # Gestão centralizada de definições
│   │   ├── security.py         # Autenticação Bearer em tempo constante
│   │   ├── schemas.py          # Modelos de validação Pydantic
│   │   ├── routes/             # Endpoints /api/health, /status, /commands
│   │   └── integrations/       # Interfaces abstratas de adaptadores
│   └── tests/
│       └── test_api.py         # Testes unitários e de integração
└── frontend/
    ├── Dockerfile              # Multi-stage build Node 22 -> Nginx Alpine
    ├── nginx.conf              # Servidor estático com headers de segurança WebXR
    ├── package.json            # Dependências Three.js e TypeScript
    ├── vite.config.ts          # Bundler e proxy de desenvolvimento
    ├── index.html              # Interface HUD 2D e contentor WebXR
    └── src/
        ├── main.ts             # Ciclo de vida da aplicação e eventos WebXR
        ├── style.css           # Estilos táticos futuristas
        ├── api/client.ts       # Cliente HTTP com Bearer token
        ├── scene/              # Núcleo 3D animado e iluminação de fundo
        ├── panels/             # Painéis espaciais e overlay HUD
        └── types/              # Definições de tipos TypeScript
```

---

## ⚡ Arranque Rápido na VM Proxmox

### 1. Clonar e Provisionar a VM
```bash
git clone <URL_DO_REPOSITORIO> /opt/jarvis-xr
cd /opt/jarvis-xr
sudo bash deploy/scripts/setup-vm.sh
```

### 2. Configurar o Ambiente
```bash
cp .env.example .env
# Gere uma chave Bearer aleatória:
sed -i "s/JARVIS_API_KEY=.*/JARVIS_API_KEY=$(openssl rand -hex 24)/" .env
```

### 3. Iniciar os Serviços
```bash
docker compose up -d --build
```

### 4. Validar o Sistema
```bash
bash deploy/scripts/validate.sh
```

Aceda através do browser ou Meta Quest 3S a:  
`https://<IP_DA_VM>` ou `https://jarvis.homelab.local`

---

## 🎙 Catálogo de Comandos de Voz Determinísticos

| Frase Reconhecida | Ação Executada |
|---|---|
| *"JARVIS, mostra a casa"* | Abre o painel holográfico da Domótica |
| *"JARVIS, mostra os servidores"* | Abre o painel do Proxmox VE |
| *"JARVIS, estado da rede"* | Abre o painel de estatísticas DNS / Pi-hole |
| *"JARVIS, mostra os serviços"* | Abre o painel de disponibilidade de serviços locais |
| *"JARVIS, liga a luz do escritório"* | Aciona a entidade autorizada do Home Assistant |
| *"JARVIS, fecha os painéis"* | Recolhe todos os painéis para o núcleo central |
| *"JARVIS, atualiza os dados"* | Força o recarregamento imediato das métricas |

