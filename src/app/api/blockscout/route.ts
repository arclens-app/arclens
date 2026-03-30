import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path")
  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 })
  
  const res = await fetch("https://testnet.arcscan.app/api/" + path)
  const data = await res.json()
  return NextResponse.json(data)
}