# JARVIS XR — Guia de Instalação no Proxmox VE

Este guia detalha os passos para provisionar a VM Debian 12 dedicada no Proxmox VE e colocar a aplicação JARVIS XR em produção.

---

## 1. Criação da Máquina Virtual no Proxmox

No interface web do Proxmox VE (porta 8006), selecione o nó e clique em **Create VM**:

1. **General:**
   - VM ID: ex.: `150`
   - Name: `jarvis-xr-vm`
   - Start at boot: Sim (selecionar para arranque automático com o Proxmox).

2. **OS:**
   - ISO Image: Selecionar a ISO oficial do Debian 12 (ex.: `debian-12.x.x-amd64-netinst.iso`).
   - Type: Linux / Kernel 6.x.

3. **System:**
   - Graphic card: Default
   - SCSI Controller: `VirtIO SCSI single`
   - Qemu Agent: Ativado (instalar `qemu-guest-agent` no Debian).

4. **Disks:**
   - Bus/Device: `SCSI`
   - Storage: `local-lvm` ou `zfs`
   - Disk size: `20 GB` (mínimo) ou `32 GB`
   - Discard: Ativado (se estiver em SSD/NVMe).

5. **CPU:**
   - Sockets: `1`
   - Cores: `2`
   - Type: `host` (máxima compatibilidade com aceleração de criptografia e Three.js).

6. **Memory:**
   - RAM: `2048 MB` (2 GB) ou `4096 MB` (4 GB)
   - Ballooning: Desativado ou com mínimo de 2048 MB.

7. **Network:**
   - Bridge: `vmbr0`
   - Model: `VirtIO (paravirtualized)`
   - Firewall: Sim.

---

## 2. Configuração do Sistema Operativo e Docker

Após a instalação base do Debian 12, aceda por SSH à VM como utilizador com privilégios `sudo`:

```bash
# 1. Clonar ou transferir o repositório
git clone <URL_DO_REPOSITORIO> /opt/jarvis-xr
cd /opt/jarvis-xr

# 2. Executar o script de provisionamento automatizado
sudo bash deploy/scripts/setup-vm.sh
```

O script `setup-vm.sh` realiza automaticamente:
- Atualização dos pacotes Debian.
- Instalação das chaves GPG e repositório oficial do Docker.
- Instalação do Docker Engine e plugin Docker Compose v2.
- Adição do utilizador atual ao grupo `docker`.
- Configuração de regras na firewall `ufw` (portas 22, 80 e 443).

---

## 3. Configuração de Variáveis de Ambiente

Copie o ficheiro de exemplo e gere uma chave de segurança:

```bash
cp .env.example .env

# Gerar token Bearer aleatório de alta entropia
sed -i "s/JARVIS_API_KEY=.*/JARVIS_API_KEY=$(openssl rand -hex 24)/" .env

# Editar .env para definir o seu domínio e parâmetros
nano .env
```

---

## 4. Inicialização da Aplicação

Inicie os contentores através do Docker Compose:

```bash
docker compose up -d --build
```

Verifique o estado dos contentores:

```bash
docker compose ps
```

Deverá visualizar 3 serviços ativos:
- `jarvis-proxy` (portas 0.0.0.0:80->80, 0.0.0.0:443->443)
- `jarvis-backend` (saudável via healthcheck `/api/health`)
- `jarvis-frontend` (saudável via healthcheck HTTP)

---

## 5. Validação e Testes Automatizados

Execute o script de validação:

```bash
bash deploy/scripts/validate.sh
```

Para verificar os logs em tempo real:

```bash
docker compose logs -f
```

