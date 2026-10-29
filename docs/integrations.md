# JARVIS XR — Guia de Integrações do Homelab

Este documento detalha como configurar e interligar os serviços reais da sua rede doméstica ao JARVIS XR.

---

## 1. Integração com o Home Assistant (Fase 4)

O JARVIS XR comunica com o Home Assistant através da API REST oficial via HTTP/HTTPS assíncrono (`httpx`).

### 1.1. Obtenção do Token de Acesso de Longa Duração (*Long-Lived Access Token*)
1. Abra a interface web do Home Assistant (ex.: `http://192.168.1.110:8123`).
2. Clique no seu perfil de utilizador (canto inferior esquerdo).
3. Na secção **Tokens de Acesso de Longa Duração**, clique em **Criar Token**.
4. Atribua o nome `jarvis-xr-token`.
5. Copie o token gerado.

### 1.2. Configuração no `.env`
```dotenv
HOME_ASSISTANT_ENABLED=true
HOME_ASSISTANT_URL=http://192.168.1.110:8123
HOME_ASSISTANT_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
HOME_ASSISTANT_TIMEOUT_SECONDS=5
HOME_ASSISTANT_ALLOWED_ENTITIES=light.escritorio,switch.tomada_servidor,sensor.temperatura_escritorio
```

---

## 2. Integração com o Proxmox VE (Fase 5)

O JARVIS XR utiliza a API oficial do Proxmox VE (`PVE API2`), aplicando estritamente permissões de **apenas leitura**.

### 2.1. Criação do API Token no Proxmox VE
1. Aceda à consola web do Proxmox VE (`https://<IP_DO_PROXMOX>:8006`).
2. Vá a **Datacenter > Permissions > Users** e crie um utilizador de sistema dedicado:
   - User name: `jarvis-monitoring`
   - Realm: `Proxmox VE authentication server (pve)`
3. Vá a **Datacenter > Permissions > API Tokens** e clique em **Add**:
   - User: `jarvis-monitoring@pve`
   - Token ID: `jarvis-token`
   - Privilege Separation: **Ativado** (recomendado para restringir privilégios).
4. Guardar o **Token Secret** (UUID) exibido apenas uma vez.
5. Em **Datacenter > Permissions > Add > User Permission**:
   - Path: `/`
   - User: `jarvis-monitoring@pve`
   - Role: `PVEAuditor` (função padrão que concede apenas privilégios de leitura, sem permissões de alterar ou destruir máquinas).

### 2.2. Configuração no `.env`
```dotenv
PROXMOX_ENABLED=true
PROXMOX_URL=https://192.168.1.100:8006
PROXMOX_TOKEN_ID=jarvis-monitoring@pve!jarvis-token
PROXMOX_TOKEN_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# Definir como true se tiver certificado TLS válido ou importado na VM
PROXMOX_VERIFY_SSL=false
PROXMOX_TIMEOUT_SECONDS=10
```

### 2.3. Endpoints Disponíveis
- `GET /api/proxmox/summary`: Resumo consolidado do cluster (CPU host %, RAM GB, nós ativos, VMs em execução).
- `GET /api/proxmox/nodes`: Lista dos nós do cluster e respetivo estado.
- `GET /api/proxmox/resources`: Lista completa de VMs (QEMU) e containers (LXC).

---

## 3. Integração com Pi-hole ou AdGuard Home (Fase 5)

O JARVIS XR suporta os dois principais servidores de DNS e bloqueio de anúncios da comunidade homelab.

### 3.1. Opção Pi-hole
1. No Pi-hole, abra **Settings > API / Web interface > Show API token** (ou crie um App Password no Pi-hole v6).
2. Configure no `.env`:
```dotenv
DNS_PROVIDER=pihole
PIHOLE_URL=http://192.168.1.120:80
PIHOLE_API_TOKEN=seu_api_token_hash_aqui
```

### 3.2. Opção AdGuard Home
1. O AdGuard Home disponibiliza autenticação HTTP Basic sobre a sua API REST `/control/stats`.
2. Configure no `.env`:
```dotenv
DNS_PROVIDER=adguard
ADGUARD_URL=http://192.168.1.120:3000
ADGUARD_USERNAME=admin
ADGUARD_PASSWORD=sua_password_aqui
```

### 3.3. Endpoints Disponíveis
- `GET /api/dns/summary`: Consultas totais, ameaças/anúncios bloqueados, percentagem de bloqueio e clientes ativos na rede.

---

## 4. Monitorização de Disponibilidade de Serviços (Anti-SSRF)

Para monitorizar serviços HTTP internos sem risco de *Server-Side Request Forgery* (SSRF), configure uma lista estática no `.env`:

```dotenv
HOMELAB_SERVICES=[{"name":"Proxmox VE","url":"https://192.168.1.100:8006"},{"name":"Home Assistant","url":"http://192.168.1.110:8123"},{"name":"Pi-hole","url":"http://192.168.1.120"},{"name":"TrueNAS / OpenMediaVault","url":"http://192.168.1.130"}]
```

Endpoint: `GET /api/services` (efetua sondagem periódica e calcula latência em ms).
