# Root proxy entrypoint in case Dokploy runs build from repository root
import sys
import os
from pathlib import Path
import importlib.util

# Add backend directory to sys.path so its internal imports work
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Dynamically load backend/main.py under a distinct module name to avoid circular import
backend_main_file = backend_dir / "main.py"
spec = importlib.util.spec_from_file_location("backend_main_module", str(backend_main_file))
backend_module = importlib.util.module_from_spec(spec)
sys.modules["backend_main_module"] = backend_module
spec.loader.exec_module(backend_module)

# Expose app object
app = backend_module.app

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)
