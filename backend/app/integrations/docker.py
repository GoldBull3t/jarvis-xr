"""Adaptador de telemetria para Docker Engine e Cosmos Cloud."""
import os
import logging
from typing import List, Dict, Any, Optional
import httpx

from app.config import settings
from app.integrations.base import BaseAdapter
from app.schemas import ContainerStats, DockerSummaryData

logger = logging.getLogger("jarvis.integrations.docker")


class DockerAdapter(BaseAdapter):
    """Adaptador de leitura assíncrono para o socket ou API do Docker Engine / Cosmos."""

    def __init__(self):
        super().__init__(name="Docker Containers")
        self.enabled = settings.DOCKER_ENABLED
        self.socket_path = settings.DOCKER_SOCKET_PATH
        self.docker_url = settings.DOCKER_URL

    async def get_summary(self) -> DockerSummaryData:
        """Obtém o estado e telemetria de todos os contentores em execução."""
        if not self.enabled:
            return DockerSummaryData(
                configured=False,
                status="disabled",
                message="Integração Docker desativada nas configurações."
            )

        # 1. Tentativa via URL HTTP remoto se configurado
        if self.docker_url:
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    resp = await client.get(f"{self.docker_url.rstrip('/')}/containers/json?all=1")
                    if resp.status_code == 200:
                        return self._parse_containers(resp.json())
            except Exception as e:
                logger.debug(f"Falha ao consultar Docker via HTTP ({self.docker_url}): {e}")

        # 2. Tentativa via Unix Domain Socket (/var/run/docker.sock)
        if os.path.exists(self.socket_path):
            try:
                # httpx suporta UDS no Linux
                transport = httpx.AsyncHTTPTransport(uds=self.socket_path)
                async with httpx.AsyncClient(transport=transport, timeout=4.0) as client:
                    resp = await client.get("http://docker/containers/json?all=1")
                    if resp.status_code == 200:
                        return self._parse_containers(resp.json())
            except Exception as e:
                logger.debug(f"Erro ao ler socket unix do Docker ({self.socket_path}): {e}")

        # Fallback informativo para ambiente de desenvolvimento ou quando socket não está montado
        return DockerSummaryData(
            configured=True,
            status="unreachable",
            total_containers=0,
            running_containers=0,
            containers=[],
            message="Socket Docker não montado em /var/run/docker.sock. Monte o volume no compose para telemetria de contentores."
        )

    def _parse_containers(self, raw_containers: List[Dict[str, Any]]) -> DockerSummaryData:
        containers: List[ContainerStats] = []
        running = 0

        for c in raw_containers:
            state = c.get("State", "unknown")
            is_running = state == "running"
            if is_running:
                running += 1

            raw_names = c.get("Names", [])
            name = raw_names[0].lstrip("/") if raw_names else c.get("Id", "")[:12]
            image = c.get("Image", "")

            containers.append(ContainerStats(
                id=c.get("Id", "")[:12],
                name=name,
                image=image,
                status=c.get("Status", ""),
                state=state,
                uptime=c.get("Status", "")
            ))

        return DockerSummaryData(
            configured=True,
            status="operational",
            total_containers=len(containers),
            running_containers=running,
            containers=containers
        )


docker_adapter = DockerAdapter()

