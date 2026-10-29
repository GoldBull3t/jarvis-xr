"""Config Flow para a integração JARVIS XR no Home Assistant."""
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
import homeassistant.helpers.config_validation as cv

DOMAIN = "jarvis_xr"


class JarvisXRConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Gere o fluxo de configuração inicial na interface gráfica do Home Assistant."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Passo inicial onde o utilizador insere URL e API Key."""
        errors = {}

        if user_input is not None:
            # Validação simples da entrada
            host = user_input.get("host", "").rstrip("/")
            api_key = user_input.get("api_key", "").strip()

            if not host or not api_key:
                errors["base"] = "invalid_auth"
            else:
                return self.async_create_entry(
                    title="JARVIS XR Hub",
                    data={
                        "host": host,
                        "api_key": api_key,
                        "tag_label": "jarvis"
                    }
                )

        schema = vol.Schema({
            vol.Required("host", default="http://jarvis-backend:8000"): str,
            vol.Required("api_key"): str,
        })

        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return JarvisXROptionsFlowHandler(config_entry)


class JarvisXROptionsFlowHandler(config_entries.OptionsFlow):
    """Gere as opções e preferências após a integração estar instalada."""

    def __init__(self, config_entry):
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        current_label = self.config_entry.options.get("tag_label", "jarvis")

        schema = vol.Schema({
            vol.Optional("tag_label", default=current_label): str,
            vol.Optional("presence_automation", default=True): bool,
        })

        return self.async_show_form(step_id="init", data_schema=schema)
