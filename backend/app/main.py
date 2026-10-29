"""Ponto de entrada principal da aplicação FastAPI do JARVIS XR."""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.config import settings
from app.schemas import APIResponse
from app.routes import health, status as sys_status, commands, home, proxmox, dns, services, diagnostics, stream

# Configuração de Logs
logging.basicConfig(
    level=getattr(logging, settings.JARVIS_LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("jarvis.backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ciclo de vida da aplicação: inicialização e encerramento seguros."""
    logger.info("==================================================")
    logger.info("   JARVIS XR BACKEND INICIALIZADO (FASE 2)       ")
    logger.info("==================================================")
    logger.info(f"Ambiente: {settings.JARVIS_ENV}")
    domain_display = settings.JARVIS_DOMAIN if settings.JARVIS_DOMAIN else "Dinâmico / Qualquer (Reverse Proxy)"
    logger.info(f"Domínio Configurado: {domain_display}")
    logger.info(f"Autenticação Bearer Ativa: {settings.is_auth_required}")
    logger.info(f"Origens CORS: {settings.cors_origins_list}")
    logger.info(f"Proxmox Ativo: {settings.PROXMOX_ENABLED}")
    logger.info(f"Home Assistant Ativo: {settings.HOME_ASSISTANT_ENABLED}")
    logger.info(f"Fornecedor DNS: {settings.DNS_PROVIDER}")
    logger.info(f"Serviços em Monitorização: {len(settings.monitored_services)}")
    yield
    logger.info("JARVIS XR Backend a encerrar serviços com segurança.")


app = FastAPI(
    title="JARVIS XR Backend API",
    description="API determinística e segura para o ecossistema JARVIS XR (Sem IA/LLM).",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json"
)

# CORS Flexível e Configurável
cors_origins = settings.cors_origins_list
if "*" in cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Tratamento padronizado de erros de validação Pydantic."""
    errors = exc.errors()
    msg = "; ".join([f"{e['loc'][-1]}: {e['msg']}" for e in errors])
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=APIResponse(
            status="error",
            error=f"Erro de validação nos parâmetros do pedido: {msg}",
            data=None
        ).model_dump(mode="json")
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Captura de erros não tratados sem expor stacktraces ou segredos."""
    logger.error(f"Erro interno não tratado: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=APIResponse(
            status="error",
            error="Ocorreu um erro interno ao processar o pedido. Consulte os registos do servidor.",
            data=None
        ).model_dump(mode="json")
    )


# Registo dos Routers
app.include_router(health.router, prefix="/api")
app.include_router(sys_status.router, prefix="/api")
app.include_router(commands.router, prefix="/api")
app.include_router(home.router, prefix="/api")
app.include_router(proxmox.router, prefix="/api")
app.include_router(dns.router, prefix="/api")
app.include_router(services.router, prefix="/api")
app.include_router(diagnostics.router, prefix="/api")
app.include_router(stream.router, prefix="/api")

