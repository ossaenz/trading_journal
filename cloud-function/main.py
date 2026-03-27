"""
Secure backend for QuantumWheel trading dashboard.
Handles OAuth token exchange and API proxying.

Deploy to Google Cloud Functions:
1. Create new function in Cloud Console
2. Runtime: Python 3.11
3. Entry point: handle_request
4. Copy this entire file as main.py
5. Install requirements (see requirements.txt)
"""

import os
import json
import requests
import secrets
from functools import wraps
from flask import Request, Response, request as flask_request
from google.cloud import secretmanager

# ============================================================================
# CONFIGURATION
# ============================================================================

SCHWAB_API_BASE = "https://api.schwabapi.com"
GOOGLE_API_BASE = "https://www.googleapis.com"

# Load from Cloud Secret Manager (or environment variables for local testing)
def get_secret(secret_name: str) -> str:
    """Retrieve secret from Google Cloud Secret Manager."""
    try:
        client = secretmanager.SecretManagerServiceClient()
        project_id = os.environ.get("GCP_PROJECT_ID")
        secret_path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
        response = client.access_secret_version(request={"name": secret_path})
        return response.payload.data.decode("UTF-8")
    except Exception:
        # Fallback to environment variables (for local testing)
        return os.environ.get(secret_name, "")

SCHWAB_CLIENT_ID = os.environ.get("SCHWAB_CLIENT_ID", "")
SCHWAB_CLIENT_SECRET = get_secret("schwab_client_secret") or os.environ.get("SCHWAB_CLIENT_SECRET", "")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = get_secret("google_client_secret") or os.environ.get("GOOGLE_CLIENT_SECRET", "")

ALLOWED_ORIGINS = [
    "https://ossaenz.github.io",
    "http://localhost:8000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:8000",
]

# ============================================================================
# MIDDLEWARE & UTILITIES
# ============================================================================

def require_auth(f):
    """Decorator to validate Bearer token from session."""
    @wraps(f)
    def decorated(*args, **kwargs):
        request = args[0] if args else kwargs.get("request")
        
        # Check for valid session token in Authorization header
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return json_response({"error": "Unauthorized"}, 401)
        
        token = auth_header.split(" ")[1]
        # TODO: Validate token against session store (Redis, Firestore, etc.)
        
        return f(*args, **kwargs)
    return decorated

def add_cors_headers(response: Response, origin: str = "") -> Response:
    """Add CORS headers to response."""
    # Allow GitHub Pages, local testing, and null origin (local file open)
    if origin in ALLOWED_ORIGINS or origin.startswith("https://ossaenz.github.io") or origin == "null" or not origin:
        allowed = origin if origin and origin != "null" else "https://ossaenz.github.io"
        response.headers["Access-Control-Allow-Origin"] = allowed
    else:
        response.headers["Access-Control-Allow-Origin"] = "https://ossaenz.github.io"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

def json_response(data: dict, status: int = 200) -> Response:
    """Return JSON response with CORS headers."""
    response = Response(
        json.dumps(data),
        status=status,
        content_type="application/json"
    )
    origin = flask_request.headers.get("Origin", "")
    return add_cors_headers(response, origin)

# ============================================================================
# OAUTH ENDPOINTS
# ============================================================================

def oauth_schwab_start(request: Request) -> Response:
    """
    Step 1: Initiate Schwab OAuth flow with PKCE.
    Returns authorization URL for frontend to redirect to.
    """
    try:
        body = request.get_json() or {}
        client_id = body.get("client_id", SCHWAB_CLIENT_ID)
        redirect_uri = body.get("redirect_uri", "https://ossaenz.github.io/trading_journal/")
        state = body.get("state") or secrets.token_urlsafe(32)
        code_challenge = body.get("code_challenge", "")
        
        # Store code_verifier in response for frontend to save
        code_verifier = secrets.token_urlsafe(96)[:128]
        
        auth_url = (
            f"{SCHWAB_API_BASE}/v1/oauth/authorize?"
            f"client_id={client_id}&"
            f"redirect_uri={redirect_uri}&"
            f"response_type=code&"
            f"scope=readonly&"
            f"state={state}&"
            f"code_challenge={code_challenge}&"
            f"code_challenge_method=S256"
        )
        
        return json_response({
            "authorization_url": auth_url,
            "state": state,
            "code_verifier": code_verifier
        })
    except Exception as e:
        return json_response({"error": str(e)}, 500)

def oauth_schwab_callback(request: Request) -> Response:
    """
    Step 2: Exchange auth code for tokens (using Client Secret from Secret Manager).
    Frontend calls this with authorization code from redirect.
    Client Secret NEVER sent to browser — only used server-side.
    """
    try:
        body = request.get_json() or {}
        code = body.get("code")
        state = body.get("state")
        client_id = body.get("client_id", SCHWAB_CLIENT_ID)
        redirect_uri = body.get("redirect_uri", "https://ossaenz.github.io/trading_journal/")
        code_verifier = body.get("code_verifier", "")
        
        if not code:
            return json_response({"error": "Missing authorization code"}, 400)
        
        # Exchange code for token using Client Secret (safe on backend!)
        token_response = requests.post(
            f"{SCHWAB_API_BASE}/v1/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "client_secret": SCHWAB_CLIENT_SECRET,  # 🔐 Never exposed to browser!
                "code_verifier": code_verifier
            },
            timeout=10
        )
        
        if token_response.status_code != 200:
            error_text = token_response.text
            return json_response(
                {"error": f"Token exchange failed: {error_text}"},
                token_response.status_code
            )
        
        tokens = token_response.json()
        
        # Return tokens to frontend (frontend stores them in localStorage)
        # In production, consider using secure cookies instead
        return json_response({
            "success": True,
            "access_token": tokens.get("access_token"),
            "refresh_token": tokens.get("refresh_token", ""),
            "expires_in": tokens.get("expires_in", 1800),
            "token_type": tokens.get("token_type", "Bearer")
        })
        
    except Exception as e:
        return json_response({"error": f"Token exchange error: {str(e)}"}, 500)

def oauth_schwab_refresh(request: Request) -> Response:
    """
    Refresh Schwab access token using refresh token.
    Client Secret used server-side only.
    """
    try:
        body = request.get_json() or {}
        refresh_token = body.get("refresh_token")
        client_id = body.get("client_id", SCHWAB_CLIENT_ID)
        
        if not refresh_token:
            return json_response({"error": "Missing refresh token"}, 400)
        
        # Request new access token
        token_response = requests.post(
            f"{SCHWAB_API_BASE}/v1/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": SCHWAB_CLIENT_SECRET  # 🔐 Safe on backend!
            },
            timeout=10
        )
        
        if token_response.status_code != 200:
            return json_response(
                {"error": "Token refresh failed"},
                token_response.status_code
            )
        
        tokens = token_response.json()
        return json_response({
            "access_token": tokens.get("access_token"),
            "refresh_token": tokens.get("refresh_token", refresh_token),  # Return new refresh token if provided
            "expires_in": tokens.get("expires_in", 1800),
            "token_type": tokens.get("token_type", "Bearer")
        })
        
    except Exception as e:
        return json_response({"error": str(e)}, 500)

# ============================================================================
# API PROXY ENDPOINTS
# ============================================================================

@require_auth
def proxy_schwab_api(request: Request) -> Response:
    """
    Proxy requests to Schwab API.
    Validates and forwards requests from frontend with proper authentication.
    """
    try:
        endpoint = request.args.get("endpoint", "")
        method = request.method.upper()
        
        if not method or method == "OPTIONS":
            return json_response({}, 204)
        
        # Get token from Authorization header
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return json_response({"error": "Missing authentication token"}, 401)
        
        token = auth_header.split(" ")[1]
        
        # Whitelist allowed endpoints (prevent SSRF)
        ALLOWED_PATTERNS = [
            "/trader/v1/accounts",
            "/trader/v1/accounts/",
            "/trader/v1/orders",
        ]
        
        if not any(endpoint.startswith(p) for p in ALLOWED_PATTERNS):
            return json_response({"error": "Endpoint not allowed"}, 403)
        
        # Forward request to Schwab API
        response = requests.request(
            method=method,
            url=f"{SCHWAB_API_BASE}{endpoint}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json"
            },
            json=request.get_json() if method in ["POST", "PUT"] else None,
            timeout=15
        )
        
        return json_response(response.json(), response.status_code)
        
    except json.JSONDecodeError:
        # Handle non-JSON responses
        return json_response({"error": "Invalid API response"}, 502)
    except requests.RequestException as e:
        return json_response({"error": f"API request failed: {str(e)}"}, 502)
    except Exception as e:
        return json_response({"error": f"Proxy error: {str(e)}"}, 500)

# ============================================================================
# HEALTH CHECK
# ============================================================================

def health_check(request: Request) -> Response:
    """Simple health check endpoint."""
    return json_response({"status": "healthy"})

# ============================================================================
# MAIN ROUTER
# ============================================================================

def handle_request(request: Request) -> Response:
    """
    Main Cloud Functions entry point.
    Routes requests to appropriate handlers.
    """
    # Handle CORS preflight — MUST return correct headers for all OPTIONS requests
    if request.method == "OPTIONS":
        response = Response("", status=204)
        origin = request.headers.get("Origin", "")
        return add_cors_headers(response, origin)
    
    path = request.path
    
    # Route requests
    if path == "/health":
        return health_check(request)
    elif path == "/oauth/schwab/start":
        return oauth_schwab_start(request)
    elif path == "/oauth/schwab/callback":
        return oauth_schwab_callback(request)
    elif path == "/oauth/schwab/refresh":
        return oauth_schwab_refresh(request)
    elif path.startswith("/api/schwab"):
        return proxy_schwab_api(request)
    else:
        return json_response({"error": "Not found"}, 404)
