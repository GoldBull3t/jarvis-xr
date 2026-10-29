"""Rotas de gestão de entidades fixadas (Favoritos) no HUD do JARVIS XR."""
import json
import os
import logging
from typing import List
from fastapi import APIRouter, Depends
from app.security import verify_api_key
from app.schemas import APIResponse, FavoritesRequest, FavoritesResponse
from app.services.audit import audit_logger

logger = logging.getLogger("jarvis.routes.favorites")
router = APIRouter(prefix="/home/favorites", tags=["Home Assistant - Favoritos"])

FAVORITES_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "favorites.json")


def _read_favorites() -> List[str]:
    try:
        if os.path.exists(FAVORITES_FILE):
            with open(FAVORITES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
    except Exception as e:
        logger.debug(f"Erro ao ler favorites.json: {e}")
    return []


def _save_favorites(entity_ids: List[str]) -> bool:
    try:
        os.makedirs(os.path.dirname(FAVORITES_FILE), exist_ok=True)
        with open(FAVORITES_FILE, "w", encoding="utf-8") as f:
            json.dump(entity_ids, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Erro ao guardar favorites.json: {e}")
        return False


@router.get("", response_model=APIResponse)
async def get_favorites(_: str = Depends(verify_api_key)):
    """Obtém a lista de IDs de entidades fixadas no HUD pelo utilizador."""
    favs = _read_favorites()
    return APIResponse(status="ok", data=FavoritesResponse(entity_ids=favs))


@router.post("", response_model=APIResponse)
async def update_favorites(payload: FavoritesRequest, _: str = Depends(verify_api_key)):
    """Atualiza a lista de entidades fixadas no HUD."""
    _save_favorites(payload.entity_ids)
    audit_logger.log(
        event_type="UI_CUSTOMIZATION",
        target="HUD Favorites",
        action="UPDATE_PINNED_DEVICES",
        confirmed=True,
        details=f"Atualizada lista de dispositivos fixados ({len(payload.entity_ids)} entidades)."
    )
    return APIResponse(status="ok", data=FavoritesResponse(entity_ids=payload.entity_ids))

