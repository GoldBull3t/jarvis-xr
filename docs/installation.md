# JARVIS XR — Guia de Instalação e Deploy

O JARVIS XR suporta dois métodos principais de instalação consoante a infraestrutura do seu homelab:
1. **Opção A (Recomendada): Cosmos Cloud via GitHub Container Registry (GHCR)** — Rápido, sem compilações locais, com certificados SSL automáticos.
2. **Opção B: Máquina Virtual Dedicada no Proxmox VE** — Isolamento total ao nível de hardware (KVM).

---

## 🌟 Opção A: Deploy no Cosmos Cloud (Recomendada)

Se já tem o **Cosmos Cloud** a correr na sua rede (seja em LXC, VM ou servidor físico):

### 1. Enviar o código para o GitHub
O repositório já está configurado com **GitHub Actions** para compilar as imagens do frontend e backend e publicá-las automaticamente no `ghcr.io`.
No seu computador pessoal:
```powershell
cd c:\Users\Bernardo\Downloads\jarvis-xr
git remote add origin https://github.com/GoldBull3t/jarvis-xr.git
git push -u origin main
```
No separador **Actions** do seu repositório GitHub, confirme que o workflow de build terminou com sucesso.

### 2. Criar a ServApp no Cosmos Cloud
1. Aceda ao painel do **Cosmos Cloud**.
2. Vá a **ServApps > Create ServApp / Import Compose**.
3. Copie e cole o conteúdo do ficheiro [`deploy/cosmos-compose.yml`](../deploy/cosmos-compose.yml):
   - Preencha os IPs e tokens do Proxmox VE e do Home Assistant nas variáveis de ambiente.
4. Clique em **Save and Start**.

### 3. Criar a Rota HTTPS no Cosmos Cloud
1. No Cosmos Cloud, vá a **URLs > New URL**:
   - **URL / Hostname:** ex.: `jarvis.meuhomelab.com`
   - **Target Container:** selecione o contentor `jarvis-frontend` (porta 80).
2. O Cosmos Cloud emite o certificado HTTPS válido automaticamente.
3. Aceda através do Meta Quest Browser diretamente ao endereço HTTPS configurado.

---

## 🖥 Opção B: Provisionamento de VM Dedicada no Proxmox VE

Se preferir isolar o JARVIS numa máquina virtual própria no Proxmox:

### 1. Criação da VM no Proxmox VE (Web UI porta 8006)
1. **General:** VM ID: `150` | Name: `jarvis-xr-vm` | Start at boot: Sim.
2. **OS:** ISO do Debian 12 (Bookworm) minimal.
3. **System:** Graphic card: Default | SCSI Controller: `VirtIO SCSI single` | Qemu Agent: Ativado.
4. **Disks:** SCSI | Storage: `local-lvm` ou `zfs` | Tamanho: `20 GB` | Discard: Ativado.
5. **CPU:** 2 vCPUs | Type: `host`.
6. **Memory:** 2048 MB (2 GB).
7. **Network:** Bridge: `vmbr0` | Model: `VirtIO (paravirtualized)`.

### 2. Provisionamento Automatizado na VM
Aceda à consola da VM e execute:
```bash
# 1. Clonar o repositório
sudo git clone https://github.com/GoldBull3t/jarvis-xr.git /opt/jarvis-xr
cd /opt/jarvis-xr
sudo chown -R $USER:$USER /opt/jarvis-xr

# 2. Executar o script oficial de provisionamento (Docker Engine + UFW Firewall)
sudo bash deploy/scripts/setup-vm.sh
```

### 3. Configuração do Ambiente (.env)
```bash
cp .env.example .env
sed -i "s/JARVIS_API_KEY=.*/JARVIS_API_KEY=$(openssl rand -hex 24)/" .env
nano .env   # Ajuste os IPs e tokens dos seus serviços locais
```

### 4. Inicialização dos Contentores
```bash
docker compose up -d --build
bash deploy/scripts/validate.sh
```

O proxy Caddy disponibiliza o acesso HTTPS em `https://<IP_DA_VM>`.
