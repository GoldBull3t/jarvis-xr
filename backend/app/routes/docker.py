"""Rotas da API para telemetria de contentores Docker e Cosmos."""
from fastapi import APIRouter, Depends
from app.security import verify_api_key
from app.schemas import APIResponse, DockerSummaryData
from app.integrations.docker import docker_adapter

router = APIRouter(prefix="/docker", tags=["Docker & Contentores"])


@router.get("/containers", response_model=APIResponse)
async def get_containers_summary(_: str = Depends(verify_api_key)):
    """Obtém a lista de contentores Docker ativos com respetivo estado."""
    summary: DockerSummaryData = await docker_adapter.get_summary()
    return APIResponse(status="ok", data=summary)

