"""Canal em tempo real Server-Sent Events (SSE) para telemetria (Pilar 3)."""
import asyncio
import json
import logging
from typing import AsyncGenerator
from fastapi import APIRouter, Request, Depends
from fastapi.responses import StreamingResponse
from app.security import verify_api_key
from app.integrations.homeassistant import ha_adapter
from app.integrations.proxmox import pve_adapter
from app.integrations.dns import dns_adapter
from app.integrations.openwrt import openwrt_adapter
from app.integrations.docker import docker_adapter

logger = logging.getLogger("jarvis.routes.stream")
router = APIRouter(prefix="/stream", tags=["Streaming"])


async def event_generator(request: Request) -> AsyncGenerator[str, None]:
    """Gera eventos SSE de telemetria contínua com detecção de desconexão."""
    # Envia evento de boas-vindas e intervalo de reconexão automática (3s)
    yield "retry: 3000\n\n"
    yield f"event: connect\ndata: {json.dumps({'message': 'Canal SSE JARVIS XR conectado'})}\n\n"

    last_ha_state: str = ""
    last_pve_state: str = ""
    last_openwrt_state: str = ""
    last_dns_state: str = ""

    while True:
        if await request.is_disconnected():
            logger.debug("Cliente SSE desconectado.")
            break

        try:
            # Recolhe resumos de forma assíncrona
            tasks = []
            if ha_adapter.is_configured():
                tasks.append(ha_adapter.get_summary())
            else:
                tasks.append(asyncio.sleep(0, result=None))

            if pve_adapter.is_configured():
                tasks.append(pve_adapter.get_summary())
            else:
                tasks.append(asyncio.sleep(0, result=None))

            if openwrt_adapter.is_configured():
                tasks.append(openwrt_adapter.get_summary())
            else:
                tasks.append(asyncio.sleep(0, result=None))

            if dns_adapter.is_configured():
                tasks.append(dns_adapter.get_summary())
            else:
                tasks.append(asyncio.sleep(0, result=None))

            if docker_adapter.is_configured():
                tasks.append(docker_adapter.get_summary())
            else:
                tasks.append(asyncio.sleep(0, result=None))

            results = await asyncio.gather(*tasks, return_exceptions=True)
            ha_summary = results[0] if not isinstance(results[0], Exception) else None
            pve_summary = results[1] if not isinstance(results[1], Exception) else None
            openwrt_summary = results[2] if not isinstance(results[2], Exception) else None
            dns_summary = results[3] if not isinstance(results[3], Exception) else None
            docker_summary = results[4] if not isinstance(results[4], Exception) else None

            # Serializa estados para detetar alterações reais
            ha_str = ha_summary.model_dump_json() if ha_summary else ""
            pve_str = pve_summary.model_dump_json() if pve_summary else ""
            openwrt_str = openwrt_summary.model_dump_json() if openwrt_summary else ""
            dns_str = dns_summary.model_dump_json() if dns_summary else ""
            docker_str = docker_summary.model_dump_json() if docker_summary else ""

            # Envia evento se houve variação ou periodicamente como heartbeat
            changed = (ha_str != last_ha_state) or (pve_str != last_pve_state) or (openwrt_str != last_openwrt_state) or (dns_str != last_dns_state)
            if changed or last_ha_state == "":
                last_ha_state = ha_str
                last_pve_state = pve_str
                last_openwrt_state = openwrt_str
                last_dns_state = dns_str

                payload = {
                    "home": ha_summary.model_dump() if ha_summary else None,
                    "proxmox": pve_summary.model_dump() if pve_summary else None,
                    "openwrt": openwrt_summary.model_dump() if openwrt_summary else None,
                    "dns": dns_summary.model_dump() if dns_summary else None,
                    "docker": docker_summary.model_dump() if docker_summary else None
                }
                yield f"event: telemetry\ndata: {json.dumps(payload)}\n\n"
            else:
                # Heartbeat tático
                yield f"event: ping\ndata: {json.dumps({'status': 'alive'})}\n\n"

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.debug(f"Erro no ciclo SSE: {e}")
            yield f"event: ping\ndata: {json.dumps({'status': 'recovering'})}\n\n"

        # Aguarda 4 segundos entre verificações
        await asyncio.sleep(4)


@router.get("/events")
async def stream_events(request: Request, _: str = Depends(verify_api_key)):
    """Endpoint de streaming SSE de telemetria em tempo real para o Meta Quest 3S e Desktop."""
    return StreamingResponse(
        event_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

