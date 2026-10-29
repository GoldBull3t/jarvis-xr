"""Componente nativo do JARVIS XR para o Home Assistant."""
import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

DOMAIN = "jarvis_xr"
PLATFORMS = ["binary_sensor"]

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Configura o JARVIS XR a partir de uma entrada de configuração gráfica."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = entry.data

    # Regista plataformas (ex: sensor de presença do Quest 3S)
    await hass.config_entries.async_forward_entry_set(entry, PLATFORMS)

    # Regista serviço para enviar voz ou notificação para o headset
    async def handle_speak_service(call):
        message = call.data.get("message", "")
        _LOGGER.info(f"[JARVIS XR] Mensagem recebida para reproduzir no headset: {message}")
        hass.bus.async_fire("jarvis_xr_speak", {"message": message})

    hass.services.async_register(DOMAIN, "speak", handle_speak_service)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Descarrega a integração."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok
