#!/usr/bin/env python3
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import asyncio
import opengradient as og

PRIVATE_KEY = "0x7e0f4781d4534d977e2dc0be51c529b84b553302978899e8bbf10bc2ed0e045c"

SYSTEM_PROMPT = """You are ArcLens AI for Arc Testnet blockchain explorer.
Arc is Circle's L1 where USDC is the native gas token.

Analyze the query and respond with ONLY valid JSON:
{
  "type": "query",
  "intent": "brief description",
  "target": null,
  "filter": "PICK ONE: bridge | large_transfers | recent_transfers | top_holders | contract_deploys | whale_wallets",
  "explanation": "plain English explanation of results",
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
}

FILTER RULES:
- bridge → user asks about bridging or cross-chain transfers
- large_transfers → user asks about large/whale/big USDC transfers  
- top_holders → user asks about top wallets, richest addresses, most USDC
- contract_deploys → user asks about new contracts or deployments
- whale_wallets → user asks about whale wallets or most active wallets
- recent_transfers → everything else USDC related

NEVER use type "address" unless user pastes an actual 0x address.
Respond ONLY with JSON. No markdown."""

async def query_og(user_query: str) -> dict:
    llm = og.LLM(private_key=PRIVATE_KEY)
    llm.ensure_opg_approval(min_allowance=0.1)
    result = await llm.chat(
        model=og.TEE_LLM.CLAUDE_HAIKU_4_5,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_query}
        ],
        max_tokens=300
    )
    content = result.chat_output.get("content", "")
    try:
        cleaned = content.replace("```json", "").replace("```", "").strip()
        return json.loads(cleaned)
    except:
        return {
            "type": "query",
            "intent": user_query,
            "target": None,
            "filter": "recent_transfers",
            "explanation": "Showing recent USDC transfers on Arc Testnet.",
            "suggestions": ["bridge activity", "large USDC transfers", "top USDC holders"]
        }

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[OG] {args[0]} {args[1]}")
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body   = json.loads(self.rfile.read(length))
        query  = body.get("query", "")
        print(f"[OG] Query: {query}")
        try:
            result = asyncio.run(query_og(query))
            print(f"[OG] filter: {result.get('filter')}")
        except Exception as e:
            print(f"[OG] Error: {e}")
            result = {"type":"query","intent":query,"target":None,"filter":"recent_transfers","explanation":"Showing recent USDC transfers on Arc Testnet.","suggestions":["bridge activity","large USDC transfers","top USDC holders"]}
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())

if __name__ == "__main__":
    server = HTTPServer(("localhost", 8765), Handler)
    print("[OG] Running on http://localhost:8765")
    server.serve_forever()
