from .chat import register_chat_routes
from .knowledge import register_knowledge_routes
from .products import register_product_routes
from .profiles import register_profile_routes
from .runtime import register_runtime_routes

__all__ = [
    "register_chat_routes",
    "register_knowledge_routes",
    "register_product_routes",
    "register_profile_routes",
    "register_runtime_routes",
]
