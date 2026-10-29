"""Adaptador de integração seguro e assíncrono para o Home Assistant."""
import logging
from typing import Dict, Any, List, Optional
import httpx

from app.config import settings
from app.integrations.base import BaseAdapter
from app.schemas import EntityState, HomeSummaryData, ActionExecutionResult

logger = logging.getLogger("jarvis.integrations.homeassistant")


class HomeAssistantAdapter(BaseAdapter):
    """Adaptador com allowlist estrita para leitura e controlo do Home Assistant."""

    def __init__(self):
        super().__init__(name="Home Assistant")
        self.url = (settings.HOME_ASSISTANT_URL or "").rstrip("/")
        self.token = settings.HOME_ASSISTANT_TOKEN or ""
        self.timeout = settings.HOME_ASSISTANT_TIMEOUT_SECONDS
        self.verify_ssl = settings.HOME_ASSISTANT_VERIFY_SSL
        self._cached_labeled_ids: set = set()

    def is_configured(self) -> bool:
        """Verifica se a integração está ativa e com credenciais preenchidas."""
        return bool(settings.HOME_ASSISTANT_ENABLED and self.url and self.token)

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

    async def get_labeled_entity_ids(self) -> List[str]:
        """Obtém IDs das entidades associadas à etiqueta configurada via Template API do HA."""
        if not self.is_configured():
            return []
        target_label = settings.HOME_ASSISTANT_DISCOVERY_LABEL.strip()
        if not target_label:
            return []
        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                payload = {"template": f"{{{{ label_entities('{target_label}') | tojson }}}}"}
                res = await client.post(f"{self.url}/api/template", headers=self._get_headers(), json=payload)
                if res.status_code == 200:
                    data = json.loads(res.text.strip())
                    if isinstance(data, list):
                        self._cached_labeled_ids = set(data)
                        return [str(x) for x in data]
        except Exception as e:
            logger.debug(f"Não foi possível obter entidades via template label do HA: {e}")
        return list(self._cached_labeled_ids)

    def _is_entity_authorized(self, entity_id: str, attributes: Optional[Dict[str, Any]] = None) -> bool:
        """
        Verifica se a entidade está autorizada por:
        1. Presença expressa na allowlist manual (settings.allowed_ha_entities)
        2. Presença no registo de etiquetas dinâmicas do HA (ex: label 'jarvis')
        3. Presença da etiqueta nos atributos diretos ou friendly_name [jarvis]
        """
        # 1. Verificação na allowlist manual
        if entity_id in settings.allowed_ha_entities:
            return True

        # 2. Descoberta dinâmica por etiqueta (Labels do Home Assistant)
        if entity_id in self._cached_labeled_ids:
            return True

        # 3. Verificação de atributos e convenção de nomes
        if attributes:
            target_label = settings.HOME_ASSISTANT_DISCOVERY_LABEL.lower()
            raw_labels = attributes.get("labels") or attributes.get("label") or attributes.get("tags") or []
            if isinstance(raw_labels, str):
                raw_labels = [raw_labels]

            for lbl in raw_labels:
                if str(lbl).lower() == target_label:
                    return True

            if f"[{target_label}]" in attributes.get("friendly_name", "").lower():
                return True

        return False

    async def health_check(self) -> Dict[str, Any]:
        """Testa se o Home Assistant está acessível via REST API."""
        if not self.is_configured():
            return {"configured": False, "status": "disabled", "message": "Integração inativa"}

        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                res = await client.get(f"{self.url}/api/", headers=self._get_headers())
                if res.status_code == 200:
                    return {"configured": True, "status": "operational", "message": res.json().get("message", "API OK")}
                return {"configured": True, "status": "error", "message": f"HTTP {res.status_code}"}
        except Exception as e:
            logger.warning(f"Falha no healthcheck do Home Assistant: {str(e)}")
            return {"configured": True, "status": "unreachable", "message": "Serviço inacessível"}

    async def get_entities(self) -> List[EntityState]:
        """Obtém o estado atual exclusivamente das entidades autorizadas."""
        if not self.is_configured():
            return []

        # Atualiza entidades por etiqueta do Home Assistant
        if settings.HOME_ASSISTANT_DISCOVERY_MODE == "labels":
            await self.get_labeled_entity_ids()

        entities: List[EntityState] = []
        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                res = await client.get(f"{self.url}/api/states", headers=self._get_headers())
                if res.status_code != 200:
                    logger.error(f"Erro ao consultar estados do Home Assistant: HTTP {res.status_code}")
                    return []

                raw_states = res.json()
                for item in raw_states:
                    entity_id = item.get("entity_id", "")
                    attrs = item.get("attributes", {})
                    if self._is_entity_authorized(entity_id, attrs):
                        domain = entity_id.split(".")[0]
                        friendly_name = attrs.get("friendly_name", entity_id)
                        entities.append(EntityState(
                            entity_id=entity_id,
                            state=item.get("state", "unknown"),
                            friendly_name=friendly_name,
                            domain=domain,
                            attributes=attrs,
                            last_updated=item.get("last_updated")
                        ))
        except Exception as e:
            logger.error(f"Erro de comunicação com Home Assistant: {str(e)}")

        return entities

    async def get_summary(self) -> HomeSummaryData:
        """Devolve resumo agregado com valores calculados e entidades autorizadas."""
        if not self.is_configured():
            return HomeSummaryData(
                configured=False,
                status="disabled"
            )

        entities = await self.get_entities()
        if not entities:
            # Testa conectividade se a lista estiver vazia
            health = await self.health_check()
            return HomeSummaryData(
                configured=True,
                status=health["status"]
            )

        temp_val: Optional[float] = None
        hum_val: Optional[float] = None
        lights_on = 0
        total_lights = 0
        switches_on = 0
        total_switches = 0

        for ent in entities:
            # Sensores de temperatura/humidade autorizados
            if ent.domain == "sensor":
                dev_class = ent.attributes.get("device_class")
                try:
                    val = float(ent.state)
                    if dev_class == "temperature" or "temp" in ent.entity_id:
                        temp_val = val
                    elif dev_class == "humidity" or "hum" in ent.entity_id:
                        hum_val = val
                except ValueError:
                    pass

            # Contagem de luzes
            elif ent.domain == "light":
                total_lights += 1
                if ent.state == "on":
                    lights_on += 1

            # Contagem de switches
            elif ent.domain == "switch":
                total_switches += 1
                if ent.state == "on":
                    switches_on += 1

        return HomeSummaryData(
            configured=True,
            status="operational",
            temperature_celsius=temp_val,
            humidity_percent=hum_val,
            lights_on=lights_on,
            total_lights=total_lights,
            switches_on=switches_on,
            total_switches=total_switches,
            authorized_entities=entities
        )

    async def control_light(self, entity_id: str, action: str = "toggle", brightness: Optional[int] = None) -> ActionExecutionResult:
        """Controla uma luz autorizada com verificação estrita de domínio e allowlist."""
        if not self.is_configured():
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unknown", message="Home Assistant não configurado")

        if not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message=f"Entidade '{entity_id}' não autorizada")

        if not entity_id.startswith("light."):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="invalid_domain", message=f"Entidade '{entity_id}' não pertence ao domínio de iluminação")

        service_name = "turn_on" if action == "on" else ("turn_off" if action == "off" else "toggle")
        payload: Dict[str, Any] = {"entity_id": entity_id}
        if brightness is not None and service_name != "turn_off":
            payload["brightness"] = brightness

        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                res = await client.post(
                    f"{self.url}/api/services/light/{service_name}",
                    headers=self._get_headers(),
                    json=payload
                )
                if res.status_code == 200:
                    # Consulta de confirmação do novo estado
                    check_res = await client.get(f"{self.url}/api/states/{entity_id}", headers=self._get_headers())
                    new_state = check_res.json().get("state", "confirmed") if check_res.status_code == 200 else "confirmed"
                    return ActionExecutionResult(
                        success=True,
                        entity_id=entity_id,
                        new_state=new_state,
                        message=f"Luz '{entity_id}' alterada para {new_state} com sucesso"
                    )
                return ActionExecutionResult(
                    success=False,
                    entity_id=entity_id,
                    new_state="error",
                    message=f"Home Assistant respondeu com HTTP {res.status_code}"
                )
        except Exception as e:
            logger.error(f"Erro ao acionar luz {entity_id}: {str(e)}")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"Falha de rede: {str(e)}")

    async def control_switch(self, entity_id: str, action: str = "toggle") -> ActionExecutionResult:
        """Controla um interruptor/tomada autorizada."""
        if not self.is_configured():
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unknown", message="Home Assistant não configurado")

        if not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message=f"Entidade '{entity_id}' não autorizada")

        if not entity_id.startswith("switch."):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="invalid_domain", message=f"Entidade '{entity_id}' não pertence ao domínio switch")

        service_name = "turn_on" if action == "on" else ("turn_off" if action == "off" else "toggle")
        payload = {"entity_id": entity_id}

        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                res = await client.post(
                    f"{self.url}/api/services/switch/{service_name}",
                    headers=self._get_headers(),
                    json=payload
                )
                if res.status_code == 200:
                    check_res = await client.get(f"{self.url}/api/states/{entity_id}", headers=self._get_headers())
                    new_state = check_res.json().get("state", "confirmed") if check_res.status_code == 200 else "confirmed"
                    return ActionExecutionResult(
                        success=True,
                        entity_id=entity_id,
                        new_state=new_state,
                        message=f"Interruptor '{entity_id}' alterado para {new_state}"
                    )
                return ActionExecutionResult(
                    success=False,
                    entity_id=entity_id,
                    new_state="error",
                    message=f"Home Assistant respondeu com HTTP {res.status_code}"
                )
        except Exception as e:
            logger.error(f"Erro ao acionar switch {entity_id}: {str(e)}")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"Falha de rede: {str(e)}")

    async def activate_scene(self, entity_id: str) -> ActionExecutionResult:
        """Ativa uma cena autorizada."""
        if not self.is_configured():
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unknown", message="Home Assistant não configurado")

        if not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message=f"Cena '{entity_id}' não autorizada")

        if not entity_id.startswith("scene."):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="invalid_domain", message=f"Entidade '{entity_id}' não pertence ao domínio scene")

        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                res = await client.post(
                    f"{self.url}/api/services/scene/turn_on",
                    headers=self._get_headers(),
                    json={"entity_id": entity_id}
                )
                if res.status_code == 200:
                    return ActionExecutionResult(
                        success=True,
                        entity_id=entity_id,
                        new_state="activated",
                        message=f"Cena '{entity_id}' ativada com sucesso"
                    )
                return ActionExecutionResult(
                    success=False,
                    entity_id=entity_id,
                    new_state="error",
                    message=f"Home Assistant HTTP {res.status_code}"
                )
        except Exception as e:
            logger.error(f"Erro ao ativar cena {entity_id}: {str(e)}")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"Falha de rede: {str(e)}")

    async def update_presence(self, active: bool, device: str = "Meta Quest 3S") -> Dict[str, Any]:
        """
        Notifica o Home Assistant da entrada/saída de sessão WebXR.
        Permite disparar automações de sala real (ex: iluminação ambiente de oficina).
        """
        if not self.is_configured():
            return {"success": False, "message": "Home Assistant não configurado"}

        target_entity = settings.HOME_ASSISTANT_PRESENCE_ENTITY
        domain = target_entity.split(".")[0]
        service = "turn_on" if active else "turn_off"

        results = {}
        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                # 1. Tenta atualizar input_boolean se existir
                if domain in ["input_boolean", "switch"]:
                    await client.post(
                        f"{self.url}/api/services/{domain}/{service}",
                        headers=self._get_headers(),
                        json={"entity_id": target_entity}
                    )

                # 2. Dispara evento nativo 'jarvis_xr_presence' no bus do Home Assistant
                event_res = await client.post(
                    f"{self.url}/api/events/jarvis_xr_presence",
                    headers=self._get_headers(),
                    json={
                        "active": active,
                        "device": device,
                        "timestamp": settings.JARVIS_ENV
                    }
                )
                results["event_fired"] = event_res.status_code == 200
                results["active"] = active
                return {"success": True, "data": results}
        except Exception as e:
            logger.warning(f"Não foi possível notificar presença ao Home Assistant: {str(e)}")
            return {"success": False, "error": str(e)}


# Instância partilhada do adaptador
ha_adapter = HomeAssistantAdapter()

