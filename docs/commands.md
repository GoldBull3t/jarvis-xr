# JARVIS XR — Catálogo de Comandos de Voz Determinísticos (Sem IA)

Este documento descreve o funcionamento do motor de voz do JARVIS XR, o catálogo completo de comandos reconhecidos e a política de privacidade e compatibilidade no Meta Quest Browser.

---

## 1. Princípios do Motor de Voz

1. **Determinismo Absoluto:** O sistema não utiliza modelos de linguagem probabilísticos, redes neurais generativas locais nem APIs de IA externas (sem OpenAI, sem Gemini, sem Ollama).
2. **Normalização Linguística:** As frases recebidas são processadas através de:
   - Conversão para minúsculas;
   - Decomposição canónica Unicode (`NFD`) e eliminação de diacríticos e acentos (ex.: "serviços" -> "servicos", "está" -> "esta");
   - Remoção de pontuação e caracteres especiais;
   - Remoção de prefixos apelativos (*"JARVIS"*, *"ó JARVIS"*) e *stopwords* de cortesia (*"por favor"*).
3. **Mapeamento Exato:** As intenções são mapeadas para identificadores estáticos internos (`CommandDefinition.id`).
4. **Sem Execução Arbitrária:** Nenhuma frase de voz pode executar comandos de terminal (`bash`, `sh`, etc.) ou invocar URLs livres. Apenas ações pré-compiladas no backend são executadas.

---

## 2. Catálogo Oficial de Comandos

| Identificador | Frases Reconhecidas (Exemplos) | Ação de Interface | Resposta Falada (`pt-PT`) |
|---|---|---|---|
| `cmd_show_home` | *"Mostra a casa"*, *"Abrir casa"*, *"Ver domótica"*, *"Estado da casa"*, *"Painel casa"* | Abre o painel Home Assistant | *"A apresentar o painel de domótica."* |
| `cmd_show_proxmox` | *"Mostra os servidores"*, *"Qual é o estado do Proxmox?"*, *"Ver servidores"*, *"Estado dos servidores"* | Abre o painel Proxmox VE | *"Servidores Proxmox carregados."* |
| `cmd_show_network` | *"Mostra o estado da rede"*, *"Estado da rede"*, *"Estatísticas do DNS"*, *"Ver Pi-hole"*, *"Ver AdGuard"* | Abre o painel DNS Shield | *"A apresentar o estado do escudo DNS e tráfego de rede."* |
| `cmd_show_services` | *"Mostra os serviços"*, *"Ver serviços"*, *"Estado dos serviços"*, *"Disponibilidade dos serviços"* | Abre o painel Serviços | *"A carregar estado dos serviços locais."* |
| `cmd_close_panels` | *"Fecha os painéis"*, *"Fechar painéis"*, *"Esconder painéis"*, *"Limpar ecrã"*, *"Voltar ao núcleo"* | Recolhe todos os painéis 3D | *"Painéis recolhidos."* |
| `cmd_system_status` | *"Estado do sistema"*, *"Diagnóstico do sistema"*, *"Resumo do homelab"*, *"Relatório geral"* | Abre painel com telemetria agregada | *"Sistemas operacionais. Ligação ao servidor estabelecida."* |
| `cmd_refresh_data` | *"Atualiza os dados"*, *"Atualizar dados"*, *"Recarregar métricas"*, *"Sincronizar métricas"* | Força novo ciclo de polling REST | *"Dados atualizados com sucesso."* |
| `cmd_light_office_on` | *"Liga a luz do escritório"*, *"Ligar luz do escritório"*, *"Acende a luz do escritório"* | Envia `turn_on` para `light.escritorio` | *"A luz do escritório foi ligada com sucesso."* |
| `cmd_light_office_off` | *"Desliga a luz do escritório"*, *"Desligar luz do escritório"*, *"Apaga a luz do escritório"* | Envia `turn_off` para `light.escritorio` | *"A luz do escritório foi desligada."* |
| `cmd_stop_listening` | *"Para de ouvir"*, *"Parar escuta"*, *"Silêncio"*, *"Fechar microfone"* | Termina a captura de áudio | *"Reconhecimento de voz desativado."* |

---

## 3. Comandos Não Reconhecidos & Ambiguidade

- Se o utilizador disser uma frase desconhecida (ex.: *"JARVIS, conta uma piada"* ou *"Qual é o sentido da vida?"*):
  - O sistema **não inventa** nem alucina uma resposta.
  - O sistema responde formalmente por voz: *"Comando não compreendido. A apresentar comandos disponíveis."*
  - A interface abre automaticamente o separador **COMANDOS** onde lista todos os comandos determinísticos válidos.

---

## 4. Privacidade e Transparência no Meta Quest Browser

> [!IMPORTANT]
> **Privacidade do Áudio no Web Speech API:**
> O Meta Quest Browser é baseado no motor Chromium (Google/Android). Por omissão, quando a `Web Speech API` é invocada (`webkitSpeechRecognition`), o browser pode recorrer a serviços na nuvem da Google ou da Meta para converter o sinal de voz em texto, caso o pacote de voz local português (`pt-PT`) não esteja instalado offline no sistema operativo Horizon OS.

- **Ativação Explícita:** O microfone **nunca** escuta em segundo plano de forma oculta. Apenas é ativado quando o utilizador prime explicitamente o botão **OUVIR COMANDO** (ou através de gesto nos controladores).
- **Feedback Sonoro e Visual:**
  - O núcleo 3D central pulsa a verde quando o microfone está ativo.
  - É emitido um tom tático sintetizado via Web Audio API ao iniciar e ao terminar a gravação.
- **Alternativa 100% Local (Sem Microfone):**
  - Todas as ações do catálogo podem ser executadas através do teclado no computador, toque/clique no HUD ou através do raio laser dos controladores Quest Touch Plus nos painéis 3D.

