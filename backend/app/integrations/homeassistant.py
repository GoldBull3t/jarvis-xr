"""Adaptador assíncrono avançado para a API REST do Home Assistant com auto-fallback e multi-domínio."""
import json
import logging
from typing import Dict, Any, List, Optional
import httpx
from app.config import settings
from app.schemas import HomeSummaryData, EntityState, ActionExecutionResult
from app.integrations.base import BaseAdapter

logger = logging.getLogger("jarvis.integrations.homeassistant")


class HomeAssistantAdapter(BaseAdapter):
    """Adaptador de alto desempenho para o Home Assistant com tolerância a falhas de rede."""

    def __init__(self):
        super().__init__(name="Home Assistant")
        self.primary_url = (settings.HOME_ASSISTANT_URL or "").rstrip("/")
        self.fallback_url = (settings.HOME_ASSISTANT_FALLBACK_URL or "").rstrip("/")
        self.active_url = self.primary_url or self.fallback_url
        self.token = settings.HOME_ASSISTANT_TOKEN or ""
        self.timeout = settings.HOME_ASSISTANT_TIMEOUT_SECONDS
        self.verify_ssl = settings.HOME_ASSISTANT_VERIFY_SSL
        self._cached_labeled_ids: set = set()
        self._cached_area_ids: set = set()

    def is_configured(self) -> bool:
        """Verifica se a integração está ativa e com credenciais preenchidas."""
        return bool(settings.HOME_ASSISTANT_ENABLED and (self.primary_url or self.fallback_url) and self.token)

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

    async def _execute_request(self, method: str, path: str, **kwargs) -> httpx.Response:
        """
        Executa pedido HTTP assíncrono com tolerância a falhas de DNS e auto-fallback.
        Se o URL primário falhar (ex: DNS resolution ou timeout), comuta automaticamente para o URL de contingência.
        """
        urls_to_try = []
        raw_candidates = []
        if self.active_url:
            raw_candidates.append(self.active_url)
        if self.primary_url:
            raw_candidates.append(self.primary_url)
        if self.fallback_url:
            raw_candidates.append(self.fallback_url)

        for u in raw_candidates:
            if not u:
                continue
            u_clean = u.strip().rstrip("/")
            if u_clean not in urls_to_try:
                urls_to_try.append(u_clean)
            # Se for endereço sem porta especificada, tenta também a porta padrão do Home Assistant (:8123)
            scheme, sep, rest = u_clean.partition("://")
            if ":" not in rest:
                u_8123 = f"{scheme}://{rest}:8123"
                if u_8123 not in urls_to_try:
                    urls_to_try.append(u_8123)

        last_error = None
        for candidate_url in urls_to_try:
            full_url = f"{candidate_url}{path}"
            headers = kwargs.pop("headers", self._get_headers())
            try:
                async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                    res = await client.request(method, full_url, headers=headers, **kwargs)
                    if res.status_code < 500:
                        if self.active_url != candidate_url:
                            logger.info(f"Home Assistant conectado com sucesso via: {candidate_url}")
                            self.active_url = candidate_url
                        return res
                    else:
                        logger.warning(f"Home Assistant em '{candidate_url}' retornou HTTP {res.status_code}")
            except Exception as e:
                last_error = e
                err_msg = f"{type(e).__name__}: {str(e)}" if str(e) else type(e).__name__
                logger.warning(f"Falha de ligação ao Home Assistant em '{candidate_url}': {err_msg}")
                continue

        if last_error:
            raise last_error
        raise httpx.RequestError("Nenhum URL do Home Assistant acessível.")

    async def get_labeled_entity_ids(self) -> List[str]:
        """Obtém IDs das entidades associadas à etiqueta configurada via Template API do HA."""
        if not self.is_configured():
            return []
        target_label = settings.HOME_ASSISTANT_DISCOVERY_LABEL.strip()
        if not target_label:
            return []
        try:
            payload = {"template": f"{{{{ label_entities('{target_label}') | tojson }}}}"}
            res = await self._execute_request("POST", "/api/template", json=payload)
            if res.status_code == 200:
                data = json.loads(res.text.strip())
                if isinstance(data, list):
                    self._cached_labeled_ids = set(data)
                    return [str(x) for x in data]
        except Exception as e:
            logger.debug(f"Não foi possível obter entidades via template label do HA: {e}")
        return list(self._cached_labeled_ids)

    async def get_area_entity_ids(self) -> List[str]:
        """Obtém IDs das entidades associadas às divisões/áreas configuradas."""
        areas = settings.allowed_ha_areas
        if not areas or not self.is_configured():
            return []
        discovered = []
        for area in areas:
            try:
                payload = {"template": f"{{{{ area_entities('{area}') | tojson }}}}"}
                res = await self._execute_request("POST", "/api/template", json=payload)
                if res.status_code == 200:
                    data = json.loads(res.text.strip())
                    if isinstance(data, list):
                        discovered.extend([str(x) for x in data])
            except Exception as e:
                logger.debug(f"Falha ao pesquisar entidades da área '{area}': {e}")
        self._cached_area_ids = set(discovered)
        return discovered

    def _is_entity_authorized(self, entity_id: str, attributes: Optional[Dict[str, Any]] = None) -> bool:
        """
        Verifica se a entidade está autorizada por:
        1. Presença expressa na allowlist manual (settings.allowed_ha_entities)
        2. Presença no registo de etiquetas dinâmicas do HA (ex: label 'jarvis')
        3. Presença nas áreas/divisões configuradas
        4. Presença da etiqueta nos atributos diretos ou friendly_name [jarvis]
        """
        # 1. Verificação na allowlist manual
        if entity_id in settings.allowed_ha_entities:
            return True

        # 2. Descoberta dinâmica por etiqueta (Labels do Home Assistant)
        if entity_id in self._cached_labeled_ids:
            return True

        # 3. Descoberta dinâmica por divisão/área
        if entity_id in self._cached_area_ids:
            return True

        # 4. Verificação de atributos e convenção de nomes
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
        """Testa se o Home Assistant está acessível via REST API com suporte a fallback."""
        if not self.is_configured():
            return {"configured": False, "status": "disabled", "message": "Integração inativa"}

        try:
            res = await self._execute_request("GET", "/api/")
            if res.status_code == 200:
                msg = res.json().get("message", "API OK")
                return {"configured": True, "status": "operational", "message": f"{msg} ({self.active_url})"}
            return {"configured": True, "status": "error", "message": f"HTTP {res.status_code}"}
        except Exception as e:
            logger.warning(f"Falha no healthcheck do Home Assistant: {str(e)}")
            return {"configured": True, "status": "unreachable", "message": f"Serviço inacessível: {str(e)[:50]}"}

    async def get_entities(self) -> List[EntityState]:
        """Obtém o estado atual das entidades autorizadas nos domínios suportados."""
        if not self.is_configured():
            return []

        # Atualiza entidades por etiqueta do Home Assistant
        if settings.HOME_ASSISTANT_DISCOVERY_MODE == "labels":
            await self.get_labeled_entity_ids()
        elif settings.HOME_ASSISTANT_DISCOVERY_MODE == "areas":
            await self.get_area_entity_ids()

        entities: List[EntityState] = []
        try:
            res = await self._execute_request("GET", "/api/states")
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
        """Devolve resumo agregado multi-domínio com luzes, tomadas, climatização, estores e media players."""
        if not self.is_configured():
            return HomeSummaryData(
                configured=False,
                status="disabled"
            )

        entities = await self.get_entities()
        if not entities:
            health = await self.health_check()
            return HomeSummaryData(
                configured=True,
                status=health["status"],
                active_url_used=self.active_url
            )

        temp_val: Optional[float] = None
        hum_val: Optional[float] = None
        lights_on = 0
        total_lights = 0
        switches_on = 0
        total_switches = 0
        covers_open = 0
        total_covers = 0
        media_players_active = 0
        total_media_players = 0

        for ent in entities:
            # Sensores de temperatura/humidade
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

            # Climatização
            elif ent.domain == "climate":
                curr_temp = ent.attributes.get("current_temperature")
                if curr_temp is not None and temp_val is None:
                    try:
                        temp_val = float(curr_temp)
                    except ValueError:
                        pass

            # Iluminação
            elif ent.domain == "light":
                total_lights += 1
                if ent.state == "on":
                    lights_on += 1

            # Interruptores / Tomadas
            elif ent.domain == "switch":
                total_switches += 1
                if ent.state == "on":
                    switches_on += 1

            # Estores / Cortinas
            elif ent.domain == "cover":
                total_covers += 1
                if ent.state == "open":
                    covers_open += 1

            # Media Players
            elif ent.domain == "media_player":
                total_media_players += 1
                if ent.state in ["playing", "on"]:
                    media_players_active += 1

        return HomeSummaryData(
            configured=True,
            status="operational",
            discovery_mode=settings.HOME_ASSISTANT_DISCOVERY_MODE,
            active_url_used=self.active_url,
            temperature_celsius=temp_val,
            humidity_percent=hum_val,
            lights_on=lights_on,
            total_lights=total_lights,
            switches_on=switches_on,
            total_switches=total_switches,
            covers_open=covers_open,
            total_covers=total_covers,
            media_players_active=media_players_active,
            total_media_players=total_media_players,
            authorized_entities=entities
        )

    async def control_light(self, entity_id: str, action: str = "toggle", brightness: Optional[int] = None) -> ActionExecutionResult:
        """Controla uma luz autorizada."""
        if not self.is_configured():
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unknown", message="Home Assistant não configurado")

        if not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message=f"Entidade '{entity_id}' não autorizada")

        if not entity_id.startswith("light."):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="invalid_domain", message=f"Entidade '{entity_id}' não pertence ao domínio light")

        service_name = "turn_on" if action == "on" else ("turn_off" if action == "off" else "toggle")
        payload: Dict[str, Any] = {"entity_id": entity_id}
        if brightness is not None and service_name != "turn_off":
            payload["brightness"] = brightness

        try:
            res = await self._execute_request("POST", f"/api/services/light/{service_name}", json=payload)
            if res.status_code == 200:
                check_res = await self._execute_request("GET", f"/api/states/{entity_id}")
                new_state = check_res.json().get("state", "confirmed") if check_res.status_code == 200 else "confirmed"
                return ActionExecutionResult(
                    success=True,
                    entity_id=entity_id,
                    new_state=new_state,
                    message=f"Luz '{entity_id}' alterada para {new_state}"
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
        """Controla um interruptor ou tomada autorizada."""
        if not self.is_configured():
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unknown", message="Home Assistant não configurado")

        if not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message=f"Entidade '{entity_id}' não autorizada")

        if not entity_id.startswith("switch."):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="invalid_domain", message=f"Entidade '{entity_id}' não pertence ao domínio switch")

        service_name = "turn_on" if action == "on" else ("turn_off" if action == "off" else "toggle")
        payload = {"entity_id": entity_id}

        try:
            res = await self._execute_request("POST", f"/api/services/switch/{service_name}", json=payload)
            if res.status_code == 200:
                check_res = await self._execute_request("GET", f"/api/states/{entity_id}")
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

    async def control_climate(self, entity_id: str, action: str, temperature: Optional[float] = None, hvac_mode: Optional[str] = None) -> ActionExecutionResult:
        """Controla uma entidade de climatização (termostato/AC)."""
        if not self.is_configured() or not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message="Não autorizado ou não configurado")

        payload: Dict[str, Any] = {"entity_id": entity_id}
        service_name = "set_temperature"

        if action == "set_temperature" and temperature is not None:
            payload["temperature"] = temperature
            service_name = "set_temperature"
        elif action == "set_hvac_mode" and hvac_mode is not None:
            payload["hvac_mode"] = hvac_mode
            service_name = "set_hvac_mode"

        try:
            res = await self._execute_request("POST", f"/api/services/climate/{service_name}", json=payload)
            if res.status_code == 200:
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state="updated", message=f"Climatização '{entity_id}' atualizada")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def control_cover(self, entity_id: str, action: str, position: Optional[int] = None) -> ActionExecutionResult:
        """Controla estores e cortinas elétricas."""
        if not self.is_configured() or not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message="Não autorizado ou não configurado")

        payload: Dict[str, Any] = {"entity_id": entity_id}
        if action == "set_position" and position is not None:
            service_name = "set_cover_position"
            payload["position"] = position
        elif action in ["open", "close", "stop", "toggle"]:
            service_name = f"{action}_cover" if action != "toggle" else "toggle"
        else:
            service_name = "toggle"

        try:
            res = await self._execute_request("POST", f"/api/services/cover/{service_name}", json=payload)
            if res.status_code == 200:
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state=action, message=f"Estore '{entity_id}' acionado com {action}")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def control_media_player(self, entity_id: str, action: str, volume_level: Optional[float] = None) -> ActionExecutionResult:
        """Controla reprodutores multimédia."""
        if not self.is_configured() or not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message="Não autorizado ou não configurado")

        payload: Dict[str, Any] = {"entity_id": entity_id}
        if action in ["play", "pause"]:
            service_name = f"media_{action}"
        elif action == "play_pause":
            service_name = "media_play_pause"
        elif action == "volume_set" and volume_level is not None:
            service_name = "volume_set"
            payload["volume_level"] = volume_level
        else:
            service_name = "media_play_pause"

        try:
            res = await self._execute_request("POST", f"/api/services/media_player/{service_name}", json=payload)
            if res.status_code == 200:
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state=action, message=f"Multimédia '{entity_id}' atualizado")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def get_camera_snapshot(self, entity_id: str) -> Optional[bytes]:
        """Obtém imagem instantânea (snapshot JPEG) de uma câmara autorizada."""
        if not self.is_configured() or not self._is_entity_authorized(entity_id):
            return None
        try:
            res = await self._execute_request("GET", f"/api/camera_proxy/{entity_id}")
            if res.status_code == 200:
                return res.content
        except Exception as e:
            logger.warning(f"Erro ao obter snapshot da câmara {entity_id}: {e}")
        return None

    async def activate_scene(self, entity_id: str) -> ActionExecutionResult:
        """Ativa uma cena autorizada."""
        if not self.is_configured():
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unknown", message="Home Assistant não configurado")

        if not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message=f"Cena '{entity_id}' não autorizada")

        try:
            res = await self._execute_request("POST", "/api/services/scene/turn_on", json={"entity_id": entity_id})
            if res.status_code == 200:
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state="activated", message=f"Cena '{entity_id}' ativada com sucesso")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            logger.error(f"Erro ao ativar cena {entity_id}: {str(e)}")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"Falha de rede: {str(e)}")

    async def update_presence(self, active: bool, device: str = "Meta Quest 3S") -> Dict[str, Any]:
        """Notifica o Home Assistant da entrada/saída de sessão WebXR."""
        if not self.is_configured():
            return {"success": False, "message": "Home Assistant não configurado"}

        target_entity = settings.HOME_ASSISTANT_PRESENCE_ENTITY
        domain = target_entity.split(".")[0]
        service = "turn_on" if active else "turn_off"

        results = {}
        try:
            if domain in ["input_boolean", "switch"]:
                await self._execute_request("POST", f"/api/services/{domain}/{service}", json={"entity_id": target_entity})

            event_res = await self._execute_request(
                "POST",
                "/api/events/jarvis_xr_presence",
                json={"active": active, "device": device, "timestamp": settings.JARVIS_ENV}
            )
            results["event_fired"] = event_res.status_code == 200
            results["active"] = active
            return {"success": True, "data": results}
        except Exception as e:
            logger.warning(f"Não foi possível notificar presença ao Home Assistant: {str(e)}")
            return {"success": False, "error": str(e)}


# Instância partilhada do adaptador
ha_adapter = HomeAssistantAdapter()
