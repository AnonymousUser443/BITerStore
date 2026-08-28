from pathlib import Path
import sys


server_path = Path(sys.argv[1])
source = server_path.read_text(encoding="utf-8")
original = '''ALLOWED_ORIGINS = [
    "https://bit101.cn",
    "http://bit101.cn",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
]'''
replacement = '''DEFAULT_ALLOWED_ORIGINS = (
    "https://bit101.cn,http://bit101.cn,"
    "http://127.0.0.1:3000,http://localhost:3000"
)
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_CORS_ORIGINS", DEFAULT_ALLOWED_ORIGINS).split(",")
    if origin.strip()
]'''

if source.count(original) != 1:
    raise SystemExit("Expected exactly one BIT-Login CORS allow-list block")

server_path.write_text(source.replace(original, replacement), encoding="utf-8")
