import json
import sys
from urllib.request import Request, urlopen


base_url = sys.argv[1].rstrip("/")
origin = sys.argv[2]

with urlopen(f"{base_url}/openapi.json", timeout=10) as response:
    document = json.load(response)

registration_paths = [
    path for path in document["paths"] if path.endswith("/registration-token")
]
expected_path = "/api/auth/{challenge_id}/registration-token"
if expected_path not in registration_paths:
    raise SystemExit(f"Missing registration route: {registration_paths}")

preflight = Request(
    f"{base_url}/api/auth/start",
    method="OPTIONS",
    headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-challenge-token",
    },
)
with urlopen(preflight, timeout=10) as response:
    allowed_origin = response.headers.get("Access-Control-Allow-Origin")
    allowed_methods = response.headers.get("Access-Control-Allow-Methods", "")
    allowed_headers = response.headers.get("Access-Control-Allow-Headers", "")

if allowed_origin != origin:
    raise SystemExit(f"Unexpected allowed origin: {allowed_origin}")
if "POST" not in allowed_methods:
    raise SystemExit(f"POST missing from allowed methods: {allowed_methods}")
for header in ("content-type", "x-challenge-token"):
    if header not in allowed_headers.lower():
        raise SystemExit(f"{header} missing from allowed headers: {allowed_headers}")

print(f"registration_path={expected_path}")
print(f"cors_origin={allowed_origin}")
print(f"cors_methods={allowed_methods}")
print(f"cors_headers={allowed_headers}")
