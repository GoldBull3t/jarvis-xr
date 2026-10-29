# JARVIS XR — Guia de Integrações do Homelab

Este documento detalha como configurar e interligar os serviços reais da sua rede doméstica ao JARVIS XR.

---

## 1. Integração com o Home Assistant

O JARVIS XR comunica com o Home Assistant através da API REST oficial via HTTP/HTTPS assíncrono (`httpx`).

### 1.1. Obtenção do Token de Acesso de Longa Duração (*Long-Lived Access Token*)
1. Abra a interface web do Home Assistant (ex.: `http://192.168.1.110:8123`).
2. Clique no seu perfil de utilizador (canto inferior esquerdo).
3. Na secção **Tokens de Acesso de Longa Duração**, clique em **Criar Token**.
4. Atribua o nome `jarvis-xr-token`.
5. Copie o token gerado.

### 1.2. Descoberta Automática por Etiquetas (*Labels* - Recomendada)
Em vez de escrever manualmente IDs de entidades em ficheiros de configuração:
1. No Home Assistant, vá a **Definições > Áreas e Etiquetas > Etiquetas**.
2. Crie uma etiqueta chamada **`jarvis`**.
3. Atribua esta etiqueta a qualquer luz, interruptor, sensor ou cena que queira ver no headset.
4. O JARVIS XR descobre e autoriza automaticamente todas as entidades com essa etiqueta!

### 1.3. Configuração de Presença e Automação de Sala ("Stark Workshop")
Quando entra em modo VR/AR nos Meta Quest 3S, o JARVIS XR notifica o Home Assistant:
- Dispara o evento nativo **`jarvis_xr_presence`** com `{ "active": true, "device": "Meta Quest 3S" }`.
- Atualiza a entidade `input_boolean.jarvis_xr_active` para `on` (ou `off` ao sair).
- **Exemplo de Automação no Home Assistant:**
  ```yaml
  alias: "Entrada no JARVIS XR - Oficina Stark"
  trigger:
    - platform: event
      event_type: jarvis_xr_presence
      event_data:
        active: true
  action:
    - service: light.turn_on
      target:
        entity_id: light.escritorio
      data:
        brightness: 80
        rgb_color: [0, 229, 255]
  ```

### 1.4. Componente Nativo do Home Assistant
Se preferir uma integração visual com entidade de conectividade oficial, instale o componente incluído na pasta [`homeassistant-integration/`](../homeassistant-integration/README.md).

### 1.5. Configuração no `.env` ou Cosmos Cloud Compose
```dotenv
HOME_ASSISTANT_ENABLED=true
HOME_ASSISTANT_URL=http://192.168.1.110:8123
HOME_ASSISTANT_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
HOME_ASSISTANT_TIMEOUT_SECONDS=5
HOME_ASSISTANT_DISCOVERY_MODE=labels
HOME_ASSISTANT_DISCOVERY_LABEL=jarvis
HOME_ASSISTANT_PRESENCE_ENTITY=input_boolean.jarvis_xr_active
# Fallback manual opcional:
HOME_ASSISTANT_ALLOWED_ENTITIES=light.escritorio,switch.tomada_servidor
```

### 1.6. Endpoints do Backend
- `GET /api/home/summary`: Resumo agregado (temperatura, luzes, entidades descobertas).
- `GET /api/home/entities`: Lista das entidades autorizadas com estado atual.
- `POST /api/home/actions/light`: Controlo de iluminação autorizada.
- `POST /api/home/actions/switch`: Controlo de interruptores/tomadas autorizadas.
- `POST /api/home/actions/scene`: Ativação de cenas autorizadas.
- `POST /api/home/presence`: Registo de presença imersiva do headset.

---

## 2. Integração com o Proxmox VE

O JARVIS XR utiliza a API oficial do Proxmox VE (`PVE API2`), aplicando permissões restritas e confirmação obrigatória de comandos.

### 2.1. Criação do API Token no Proxmox VE
1. Aceda à consola web do Proxmox VE (`https://<IP_DO_PROXMOX>:8006`).
2. Em **Datacenter > Permissions > Users**, crie o utilizador: `jarvis-monitoring@pve`.
3. Em **Datacenter > Permissions > API Tokens**, clique em **Add**:
   - User: `jarvis-monitoring@pve` | Token ID: `jarvis-token`.
   - Privilege Separation: **Ativado**.
4. Guarde o **Token Secret** (UUID) exibido apenas uma vez.
5. Em **Datacenter > Permissions > Add > User Permission**:
   - Path: `/`
   - User: `jarvis-monitoring@pve`
   - Role: `PVEAuditor` (para monitorização) ou com privilégios de `VM.PowerMgmt` apenas nas VMs autorizadas.

### 2.2. Ciclo de Vida Seguro de VMs (Start / Shutdown / Reboot)
- **Barreira de Segurança:** Apenas as VMs configuradas em `PROXMOX_ALLOWED_VMIDS` podem receber ordens de energia.
- **Encerramento Limpo (ACPI):** O comando `shutdown` envia uma instrução ACPI ao sistema operativo da VM para encerramento ordeiro, sem corte abrupto de eletricidade.
- **Confirmação Obrigatória:** A interface exige confirmação prévia para evitar desligar máquinas inadvertidamente.

### 2.3. Configuração no `.env` ou Cosmos Cloud Compose
```dotenv
PROXMOX_ENABLED=true
PROXMOX_URL=https://192.168.1.100:8006
PROXMOX_TOKEN_ID=jarvis-monitoring@pve!jarvis-token
PROXMOX_TOKEN_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PROXMOX_VERIFY_SSL=false
PROXMOX_TIMEOUT_SECONDS=10
# VMIDs autorizados a receber ações de ligar/desligar (separados por vírgula):
PROXMOX_ALLOWED_VMIDS=101,102
```

### 2.4. Endpoints do Backend
- `GET /api/proxmox/summary`: Resumo do cluster (CPU host %, RAM GB, VMs, storage pools e estado do último backup).
- `GET /api/proxmox/nodes`: Lista dos nós do cluster e respetivo estado.
- `GET /api/proxmox/resources`: Lista completa de VMs (QEMU) e containers (LXC).
- `GET /api/proxmox/storage`: Capacidade e utilização dos pools ZFS/LVM/NFS.
- `GET /api/proxmox/backups`: Estado da última tarefa de backup (`vzdump`).
- `POST /api/proxmox/actions/vm`: Executa `start`, `shutdown` ou `reboot` na VM autorizada com confirmação explícita.

---

## 3. Integração com Pi-hole ou AdGuard Home

O JARVIS XR suporta os dois principais servidores de DNS e bloqueio de anúncios da comunidade homelab.

### 3.1. Opção Pi-hole
```dotenv
DNS_PROVIDER=pihole
PIHOLE_URL=http://192.168.1.120:80
PIHOLE_API_TOKEN=seu_api_token_hash_aqui
```

### 3.2. Opção AdGuard Home
```dotenv
DNS_PROVIDER=adguard
ADGUARD_URL=http://192.168.1.120:3000
ADGUARD_USERNAME=admin
ADGUARD_PASSWORD=sua_password_aqui
```

Endpoint: `GET /api/dns/summary` (consultas diárias, ameaças/anúncios bloqueados, percentagem de bloqueio e clientes ativos).

---

## 4. Monitorização de Disponibilidade de Serviços (Anti-SSRF)

Lista estática no servidor de serviços a monitorizar periodicamente:
```dotenv
HOMELAB_SERVICES=[{"name":"Proxmox VE","url":"https://192.168.1.100:8006"},{"name":"Home Assistant","url":"http://192.168.1.110:8123"},{"name":"Pi-hole","url":"http://192.168.1.120"},{"name":"Cosmos Cloud","url":"http://192.168.1.150"}]
```

Endpoint: `GET /api/services` (medição de latência em milissegundos).
