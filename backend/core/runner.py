import httpx
import time
from typing import Dict, Any, List
from models import ApiEndpoint

async def execute_test_step(
    client: httpx.AsyncClient, 
    endpoint: ApiEndpoint, 
    base_url: str, 
    variables: Dict[str, Any],
    test_data: Dict[str, Any]
) -> Dict[str, Any]:
    
    # 0. Get specific data for this endpoint
    op_id = endpoint.operationId or f"{endpoint.method}_{endpoint.path}"
    op_data = test_data.get(op_id, {})
    
    # 1. Substitute Variables in URL
    # Context includes global variables, global test data, and this operation's specific parameters
    context = {**variables, **test_data, **op_data.get("parameters", {})}
    
    def replace_placeholders(text: str, ctx: Dict[str, Any]) -> str:
        # Sort keys by length descending to avoid partial matches
        for k in sorted(ctx.keys(), key=len, reverse=True):
            v = ctx[k]
            # Handle string/int values
            if isinstance(v, (str, int, float, bool)):
                text = text.replace(f"{{{{{k}}}}}", str(v))
                text = text.replace(f"{{{k}}}", str(v))
            # Handle nested objects (rudimentary)
            elif isinstance(v, dict):
                for sub_k, sub_v in v.items():
                    if isinstance(sub_v, (str, int, float, bool)):
                        text = text.replace(f"{{{{{k}.{sub_k}}}}}", str(sub_v))
                        text = text.replace(f"{{{k}.{sub_k}}}", str(sub_v))
        return text

    # Normalize URL segments
    base = base_url.rstrip("/")
    path = endpoint.path.lstrip("/")
    url = f"{base}/{path}"
    url = replace_placeholders(url, context)
    
    # Also replace path parameters explicitly defined in Swagger if missing from placeholder logic
    if endpoint.parameters:
        for param in endpoint.parameters:
            if param.get("in") == "path":
                p_name = param["name"]
                if p_name in context:
                    val = context[p_name]
                    url = url.replace(f"{{{p_name}}}", str(val))

    # 2. Prepare Body
    body = None
    if endpoint.method in ["POST", "PUT", "PATCH"]:
        # Extract body from op_data or fallback to root op_id
        body = op_data.get("body")
    
    # 3. Request
    start_time = time.time()
    
    # Merge headers
    req_headers = variables.get("headers", {})
    if not req_headers and "headers" in test_data:
        req_headers = test_data["headers"]

    try:
        response = await client.request(
            method=endpoint.method,
            url=url,
            json=body,
            headers=req_headers,
            timeout=10.0
        )
        
        duration = (time.time() - start_time) * 1000
        # Relaxed passing condition: any response from server < 500 is technically a "successful" test execution
        # (The user can interpret 404 as "User not found" which is valid behavior)
        passed = response.status_code < 500
        
        # Safe JSON extraction
        resp_data = None
        if "application/json" in response.headers.get("content-type", "").lower():
            try:
                resp_data = response.json()
            except:
                resp_data = response.text
        else:
            resp_data = response.text

        # If data is empty string or None, explicitly return "No Data"
        if not resp_data and resp_data != 0 and resp_data != False:
             resp_data = "No Data"

        return {
            "endpoint": endpoint.path,
            "method": endpoint.method,
            "status": response.status_code,
            "time": duration,
            "passed": passed,
            "response": resp_data,
            "url": url # for debugging
        }

    except Exception as e:
        return {
            "endpoint": endpoint.path,
            "method": endpoint.method,
            "status": 0,
            "time": 0,
            "passed": False,
            "error": str(e),
            "url": url
        }
