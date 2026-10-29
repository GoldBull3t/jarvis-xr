"""Sensor binário de presença imersiva nos Meta Quest 3S."""
from homeassistant.components.binary_sensor import (
    BinarySensorEntity,
    BinarySensorDeviceClass
)
from homeassistant.core import callback

DOMAIN = "jarvis_xr"


async def async_setup_entry(hass, entry, async_add_entities):
    """Configura o sensor binário de presença espacial."""
    sensor = JarvisXRPresenceSensor(hass, entry)
    async_add_entities([sensor], True)


class JarvisXRPresenceSensor(BinarySensorEntity):
    """Representa o estado de utilização ativa do headset Meta Quest 3S."""

    _attr_has_entity_name = True
    _attr_name = "Imersão Meta Quest 3S"
    _attr_unique_id = "jarvis_xr_presence_sensor"
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY
    _attr_icon = "https://raw.githubusercontent.com/GoldBull3t/jarvis-xr/main/frontend/public/favicon.ico"

    def __init__(self, hass, entry):
        self.hass = hass
        self._entry = entry
        self._is_on = False

    @property
    def is_on(self) -> bool:
        """Devolve True se o utilizador estiver ativamente em VR/AR."""
        return self._is_on

    async def async_added_to_hass(self):
        """Escuta eventos disparados pelo backend do JARVIS XR."""
        @callback
        def handle_presence_event(event):
            active = event.data.get("active", False)
            self._is_on = active
            self.async_write_ha_state()

        self.async_on_remove(
            self.hass.bus.async_listen("jarvis_xr_presence", handle_presence_event)
        )
