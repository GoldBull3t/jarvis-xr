# JARVIS XR — Integração Oficial para o Home Assistant

Esta pasta contém o componente personalizado nativo para o Home Assistant (`custom_components/jarvis_xr`).

---

## 🌟 O que esta integração adiciona ao seu Home Assistant:

1. **Configuração Gráfica (UI Flow):** Adicione o JARVIS XR diretamente em **Definições > Dispositivos e Serviços > Adicionar Integração**.
2. **Sensor de Presença no Quest 3S (`binary_sensor.jarvis_xr_active`):**
   - Fica a **`on`** quando coloca os Meta Quest 3S e entra no modo espacial.
   - Fica a **`off`** quando sai da sessão XR.
   - **Automação de Sala:** Permite que a sua sala mude de luzes automaticamente para um ambiente imersivo (ex: luzes azuis ténues estilo *Tony Stark Workshop*).
3. **Serviço de Fala (`jarvis_xr.speak`):** O Home Assistant pode enviar avisos falados para o headset enquanto estiver a jogar ou a monitorizar o homelab!

---

## 🚀 Como Instalar no Home Assistant

### Método 1: Cópia Direta de Ficheiros
1. Aceda à pasta de configuração do seu Home Assistant (via Samba, SSH ou File Editor).
2. Copie a pasta `custom_components/jarvis_xr` para dentro de `/config/custom_components/`:
   ```text
   /config/
   └── custom_components/
       └── jarvis_xr/
           ├── __init__.py
           ├── manifest.json
           ├── config_flow.py
           ├── binary_sensor.py
           └── strings.json
   ```
3. Reinicie o Home Assistant.
4. Vá a **Definições > Dispositivos e Serviços > Adicionar Integração**, pesquise por **JARVIS XR** e siga o assistente no ecrã.

---

## 🏷 Alternativa Sem Ficheiros: Sistema de Etiquetas (*Labels*)

Se preferir não instalar nenhum componente personalizado no Home Assistant, o JARVIS XR suporta nativamente **descoberta por etiquetas**:
1. No Home Assistant, vá a **Definições > Áreas e Etiquetas > Etiquetas**.
2. Crie uma etiqueta chamada **`jarvis`**.
3. Atribua esta etiqueta a qualquer luz, tomada ou sensor que pretenda ver no headset.
4. O JARVIS deteta-as automaticamente em tempo real!

