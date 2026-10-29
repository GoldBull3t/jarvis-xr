"""Adaptador assíncrono avançado para a API REST do Home Assistant com auto-fallback e multi-domínio completo."""
import json
import logging
from typing import Dict, Any, List, Optional
import httpx
from app.config import settings
from app.schemas import (
    HomeSummaryData,
    EntityState,
    ActionExecutionResult,
    CameraEntityInfo
)
from app.integrations.base import BaseAdapter

logger = logging.getLogger("jarvis.integrations.homeassistant")


class HomeAssistantAdapter(BaseAdapter):
    """Adaptador de alto desempenho para o Home Assistant com tolerância a falhas de rede e descoberta global."""

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
        self._cached_area_map: Dict[str, str] = {}

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
        Se o URL primário falhar, comuta automaticamente para o URL de contingência.
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

    async def get_entity_areas_map(self) -> Dict[str, str]:
        """Obtém o mapeamento de cada entidade para a sua respetiva Divisão/Área real no Home Assistant."""
        if not self.is_configured():
            return {}
        try:
            payload = {"template": "{{ { e.entity_id: area_name(e.entity_id) for e in states if area_name(e.entity_id) is not none } | tojson }}"}
            res = await self._execute_request("POST", "/api/template", json=payload)
            if res.status_code == 200:
                data = json.loads(res.text.strip())
                if isinstance(data, dict):
                    self._cached_area_map = {str(k): str(v) for k, v in data.items() if v}
                    return self._cached_area_map
        except Exception as e:
            logger.debug(f"Não foi possível obter mapeamento de áreas via template do HA: {e}")
        return self._cached_area_map

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
        Verifica se a entidade está autorizada:
        1. Se HOME_ASSISTANT_DISCOVERY_MODE for "all", aceita todas as entidades de domínios residenciais permitidos.
        2. Presença na allowlist manual (settings.allowed_ha_entities).
        3. Presença no registo de etiquetas dinâmicas do HA (ex: label 'jarvis').
        4. Presença nas áreas/divisões configuradas.
        5. Presença da etiqueta nos atributos diretos ou friendly_name [jarvis].
        """
        domain = entity_id.split(".")[0] if "." in entity_id else ""

        # 1. Modo de Descoberta Geral ("all")
        if settings.HOME_ASSISTANT_DISCOVERY_MODE == "all" or not settings.HOME_ASSISTANT_DISCOVERY_MODE:
            # Exclui domínios técnicos que poluem a interface sem utilidade de controlo doméstico
            if domain in ["update", "persistent_notification", "event", "zone", "stt", "tts", "conversation"]:
                return False
            # Aceita se pertencer aos domínios residenciais suportados
            if domain in settings.allowed_ha_domains:
                return True

        # 2. Allowlist manual específica
        if entity_id in settings.allowed_ha_entities:
            return True

        # 3. Descoberta dinâmica por etiqueta (Labels do Home Assistant)
        if entity_id in self._cached_labeled_ids:
            return True

        # 4. Descoberta dinâmica por divisão/área
        if entity_id in self._cached_area_ids:
            return True

        # 5. Verificação de atributos e convenção de nomes
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
        """Obtém o estado atual de todas as entidades autorizadas nos domínios suportados."""
        if not self.is_configured():
            return []

        # Atualiza etiquetas e áreas se o modo assim o exigir
        if settings.HOME_ASSISTANT_DISCOVERY_MODE == "labels":
            await self.get_labeled_entity_ids()
        elif settings.HOME_ASSISTANT_DISCOVERY_MODE == "areas":
            await self.get_area_entity_ids()

        # Atualiza mapeamento de divisões reais
        await self.get_entity_areas_map()

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
                    area_name = self._cached_area_map.get(entity_id) or attrs.get("area_name")
                    device_class = attrs.get("device_class")
                    icon = attrs.get("icon")
                    unit = attrs.get("unit_of_measurement")

                    entities.append(EntityState(
                        entity_id=entity_id,
                        state=item.get("state", "unknown"),
                        friendly_name=friendly_name,
                        domain=domain,
                        area_name=area_name,
                        device_class=device_class,
                        icon=icon,
                        unit_of_measurement=unit,
                        attributes=attrs,
                        last_updated=item.get("last_updated")
                    ))
        except Exception as e:
            logger.error(f"Erro de comunicação com Home Assistant: {str(e)}")

        return entities

    async def get_summary(self) -> HomeSummaryData:
        """Devolve resumo agregado multi-domínio detalhado com energia, segurança, climatização e multimédia."""
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
        power_val: Optional[float] = None
        energy_val: Optional[float] = None
        lights_on = 0
        total_lights = 0
        switches_on = 0
        total_switches = 0
        covers_open = 0
        total_covers = 0
        media_players_active = 0
        total_media_players = 0
        binary_alerts = 0
        total_binary = 0
        cameras_count = 0
        scenes_count = 0
        climates_count = 0
        domains_summary: Dict[str, int] = {}
        unique_areas: set = set()

        low_battery_devices: List[Dict[str, Any]] = []
        open_perimeters: List[str] = []

        for ent in entities:
            d = ent.domain
            domains_summary[d] = domains_summary.get(d, 0) + 1
            if ent.area_name:
                unique_areas.add(ent.area_name)

            # Verificação de bateria dos sensores do homelab
            dev_class_attr = ent.device_class or ent.attributes.get("device_class")
            battery_attr = ent.attributes.get("battery_level") or ent.attributes.get("battery")
            if battery_attr is not None:
                try:
                    bat_num = float(battery_attr)
                    if bat_num < 20:
                        low_battery_devices.append({"name": ent.friendly_name, "level": bat_num, "entity_id": ent.entity_id})
                except (ValueError, TypeError):
                    pass

            if d == "light":
                total_lights += 1
                if ent.state == "on":
                    lights_on += 1

            elif d == "switch":
                total_switches += 1
                if ent.state == "on":
                    switches_on += 1

            elif d == "cover":
                total_covers += 1
                if ent.state in ["open", "opening"]:
                    covers_open += 1

            elif d == "media_player":
                total_media_players += 1
                if ent.state in ["playing", "on", "buffering"]:
                    media_players_active += 1

            elif d == "camera":
                cameras_count += 1

            elif d in ["scene", "script"]:
                scenes_count += 1

            elif d == "climate":
                climates_count += 1
                curr_temp = ent.attributes.get("current_temperature")
                if curr_temp is not None and temp_val is None:
                    try:
                        temp_val = float(curr_temp)
                    except (ValueError, TypeError):
                        pass

            elif d == "binary_sensor":
                total_binary += 1
                dev_class = ent.device_class or ent.attributes.get("device_class")
                # Alertas para portas, janelas, fugas de água, fumo, segurança ou movimento
                if ent.state in ["on", "open"] and dev_class in [
                    "door", "window", "garage_door", "opening", "smoke", "moisture",
                    "gas", "safety", "problem", "motion", "occupancy"
                ]:
                    binary_alerts += 1
                    if dev_class in ["door", "window", "garage_door", "opening"]:
                        open_perimeters.append(f"{ent.friendly_name} ({ent.area_name or 'Perímetro'})")

            elif d == "sensor":
                dev_class = ent.device_class or ent.attributes.get("device_class")
                unit = ent.unit_of_measurement or ent.attributes.get("unit_of_measurement")
                try:
                    num_val = float(ent.state)
                    if dev_class == "battery" or "battery" in ent.entity_id:
                        if num_val < 20:
                            low_battery_devices.append({"name": ent.friendly_name, "level": num_val, "entity_id": ent.entity_id})
                    elif (dev_class == "temperature" or "temp" in ent.entity_id) and temp_val is None:
                        temp_val = num_val
                    elif (dev_class == "humidity" or "hum" in ent.entity_id) and hum_val is None:
                        hum_val = num_val
                    elif dev_class == "power" or unit == "W":
                        if power_val is None or "total" in ent.entity_id or "consumo" in ent.entity_id:
                            power_val = num_val
                    elif dev_class == "energy" or unit == "kWh":
                        if energy_val is None or "total" in ent.entity_id or "consumo" in ent.entity_id:
                            energy_val = num_val
                except (ValueError, TypeError):
                    pass

        return HomeSummaryData(
            configured=True,
            status="operational",
            discovery_mode=settings.HOME_ASSISTANT_DISCOVERY_MODE,
            active_url_used=self.active_url,
            primary_url=self.primary_url,
            fallback_url=self.fallback_url,
            temperature_celsius=temp_val,
            humidity_percent=hum_val,
            power_consumption_watts=power_val,
            energy_consumption_kwh=energy_val,
            lights_on=lights_on,
            total_lights=total_lights,
            switches_on=switches_on,
            total_switches=total_switches,
            covers_open=covers_open,
            total_covers=total_covers,
            media_players_active=media_players_active,
            total_media_players=total_media_players,
            binary_sensors_alert=binary_alerts,
            total_binary_sensors=total_binary,
            cameras_count=cameras_count,
            scenes_count=scenes_count,
            climates_count=climates_count,
            domains_summary=domains_summary,
            areas=sorted(list(unique_areas)),
            authorized_entities=entities,
            low_battery_devices=low_battery_devices,
            low_battery_count=len(low_battery_devices),
            open_perimeters=open_perimeters
        )

    async def control_light(
        self,
        entity_id: str,
        action: str = "toggle",
        brightness: Optional[int] = None,
        color_temp: Optional[int] = None,
        rgb_color: Optional[List[int]] = None
    ) -> ActionExecutionResult:
        """Controla iluminação com suporte a ligar/desligar, brilho e cor."""
        if not self.is_configured():
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unknown", message="Home Assistant não configurado")

        if not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message=f"Entidade '{entity_id}' não autorizada")

        service_name = "turn_on" if action == "on" else ("turn_off" if action == "off" else "toggle")
        payload: Dict[str, Any] = {"entity_id": entity_id}
        if service_name != "turn_off":
            if brightness is not None:
                payload["brightness"] = brightness
            if color_temp is not None:
                payload["color_temp"] = color_temp
            if rgb_color is not None and len(rgb_color) == 3:
                payload["rgb_color"] = rgb_color

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
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def control_switch(self, entity_id: str, action: str = "toggle") -> ActionExecutionResult:
        """Controla um interruptor ou tomada autorizada."""
        if not self.is_configured() or not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message="Não autorizado ou não configurado")

        service_name = "turn_on" if action == "on" else ("turn_off" if action == "off" else "toggle")
        try:
            res = await self._execute_request("POST", f"/api/services/switch/{service_name}", json={"entity_id": entity_id})
            if res.status_code == 200:
                check_res = await self._execute_request("GET", f"/api/states/{entity_id}")
                new_state = check_res.json().get("state", "confirmed") if check_res.status_code == 200 else "confirmed"
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state=new_state, message=f"Interruptor alterado para {new_state}")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def control_climate(
        self,
        entity_id: str,
        action: str = "set_temperature",
        temperature: Optional[float] = None,
        hvac_mode: Optional[str] = None,
        fan_mode: Optional[str] = None
    ) -> ActionExecutionResult:
        """Controla termostato ou ar condicionado (temperatura alvo, modo HVAC e ventilação)."""
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
        elif action == "set_fan_mode" and fan_mode is not None:
            payload["fan_mode"] = fan_mode
            service_name = "set_fan_mode"

        try:
            res = await self._execute_request("POST", f"/api/services/climate/{service_name}", json=payload)
            if res.status_code == 200:
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state="updated", message=f"Climatização '{entity_id}' atualizada")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def control_cover(self, entity_id: str, action: str = "toggle", position: Optional[int] = None) -> ActionExecutionResult:
        """Controla estores e cortinas elétricas com suporte a posição percentual."""
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
        """Controla reprodutores multimédia (TV, Colunas, etc.)."""
        if not self.is_configured() or not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message="Não autorizado ou não configurado")

        payload: Dict[str, Any] = {"entity_id": entity_id}
        if action in ["play", "pause"]:
            service_name = f"media_{action}"
        elif action == "play_pause":
            service_name = "media_play_pause"
        elif action in ["next", "previous"]:
            service_name = f"media_{action}_track"
        elif action == "volume_set" and volume_level is not None:
            service_name = "volume_set"
            payload["volume_level"] = volume_level
        elif action == "mute":
            service_name = "volume_mute"
            payload["is_volume_muted"] = True
        else:
            service_name = "media_play_pause"

        try:
            res = await self._execute_request("POST", f"/api/services/media_player/{service_name}", json=payload)
            if res.status_code == 200:
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state=action, message=f"Multimédia '{entity_id}' atualizado")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def control_lock(self, entity_id: str, action: str = "lock", code: Optional[str] = None) -> ActionExecutionResult:
        """Controla fechaduras inteligentes (trancar/destrancar)."""
        if not self.is_configured() or not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message="Não autorizado ou não configurado")

        service_name = "lock" if action == "lock" else "unlock"
        payload: Dict[str, Any] = {"entity_id": entity_id}
        if code:
            payload["code"] = code

        try:
            res = await self._execute_request("POST", f"/api/services/lock/{service_name}", json=payload)
            if res.status_code == 200:
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state=action, message=f"Fechadura '{entity_id}' {action} executado")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def control_fan(self, entity_id: str, action: str = "toggle", percentage: Optional[int] = None) -> ActionExecutionResult:
        """Controla ventoinhas e sistemas de circulação de ar."""
        if not self.is_configured() or not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message="Não autorizado ou não configurado")

        payload: Dict[str, Any] = {"entity_id": entity_id}
        if action == "set_percentage" and percentage is not None:
            service_name = "set_percentage"
            payload["percentage"] = percentage
        elif action in ["turn_on", "turn_off", "toggle"]:
            service_name = action
        else:
            service_name = "toggle"

        try:
            res = await self._execute_request("POST", f"/api/services/fan/{service_name}", json=payload)
            if res.status_code == 200:
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state=action, message=f"Ventoinha '{entity_id}' atualizada")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def control_vacuum(self, entity_id: str, action: str = "start") -> ActionExecutionResult:
        """Controla aspiradores robotizados (iniciar, pausar, retornar à base)."""
        if not self.is_configured() or not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message="Não autorizado ou não configurado")

        service_name = action if action in ["start", "pause", "stop", "return_to_base"] else "start"
        try:
            res = await self._execute_request("POST", f"/api/services/vacuum/{service_name}", json={"entity_id": entity_id})
            if res.status_code == 200:
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state=action, message=f"Aspirador '{entity_id}' acionado com {action}")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def trigger_automation(self, entity_id: str, action: str = "trigger") -> ActionExecutionResult:
        """Dispara ou comuta automações do Home Assistant."""
        if not self.is_configured() or not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message="Não autorizado ou não configurado")

        service_name = action if action in ["trigger", "turn_on", "turn_off", "toggle"] else "trigger"
        try:
            res = await self._execute_request("POST", f"/api/services/automation/{service_name}", json={"entity_id": entity_id})
            if res.status_code == 200:
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state=action, message=f"Automação '{entity_id}' acionada")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def activate_script(self, entity_id: str, variables: Optional[Dict[str, Any]] = None) -> ActionExecutionResult:
        """Executa um script de domótica do Home Assistant."""
        if not self.is_configured() or not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message="Não autorizado ou não configurado")

        script_name = entity_id.replace("script.", "")
        payload = {"variables": variables} if variables else {}
        try:
            res = await self._execute_request("POST", f"/api/services/script/{script_name}", json=payload)
            if res.status_code == 200:
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state="executed", message=f"Script '{entity_id}' executado com sucesso")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def activate_scene(self, entity_id: str) -> ActionExecutionResult:
        """Ativa uma cena de domótica autorizada."""
        if not self.is_configured() or not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message="Não autorizado ou não configurado")

        try:
            res = await self._execute_request("POST", "/api/services/scene/turn_on", json={"entity_id": entity_id})
            if res.status_code == 200:
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state="activated", message=f"Cena '{entity_id}' ativada com sucesso")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def execute_generic_service(
        self,
        entity_id: str,
        domain: str,
        service: str,
        service_data: Optional[Dict[str, Any]] = None
    ) -> ActionExecutionResult:
        """Executa qualquer serviço genérico do Home Assistant de forma determinística."""
        if not self.is_configured() or not self._is_entity_authorized(entity_id):
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="unauthorized", message="Não autorizado ou não configurado")

        payload: Dict[str, Any] = {"entity_id": entity_id}
        if service_data:
            payload.update(service_data)

        try:
            res = await self._execute_request("POST", f"/api/services/{domain}/{service}", json=payload)
            if res.status_code == 200:
                return ActionExecutionResult(success=True, entity_id=entity_id, new_state="executed", message=f"Serviço {domain}.{service} executado")
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=f"HTTP {res.status_code}")
        except Exception as e:
            return ActionExecutionResult(success=False, entity_id=entity_id, new_state="error", message=str(e))

    async def get_cameras_list(self) -> List[CameraEntityInfo]:
        """Devolve a lista de todas as câmaras de segurança detetadas no Home Assistant."""
        entities = await self.get_entities()
        cameras: List[CameraEntityInfo] = []
        for ent in entities:
            if ent.domain == "camera":
                cameras.append(CameraEntityInfo(
                    entity_id=ent.entity_id,
                    friendly_name=ent.friendly_name,
                    state=ent.state,
                    area_name=ent.area_name
                ))
        return cameras

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
