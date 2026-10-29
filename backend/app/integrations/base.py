"""Classe base abstrata para todos os adaptadores de serviços externos."""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional


class BaseAdapter(ABC):
    """Contrato base para adaptadores de serviços do homelab."""

    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    def is_configured(self) -> bool:
        """Indica se as credenciais e parâmetros essenciais estão configurados."""
        pass

    @abstractmethod
    async def health_check(self) -> Dict[str, Any]:
        """Testa a conectividade com o serviço e devolve o estado."""
        pass

    @abstractmethod
    async def get_summary(self) -> Dict[str, Any]:
        """Obtém resumo normalizado de métricas ou estado do serviço."""
        pass

