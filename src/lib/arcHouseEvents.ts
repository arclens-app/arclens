const ARC_HOUSE_EVENTS_URL = "https://community.arc.io/public/events"

type ArcHouseRawEvent = {
  id?: string
  slug?: string
  name?: string
  eventType?: string
  displayEventType?: string
  isOnline?: boolean
  startedAt?: string
  endedAt?: string
  timezone?: string
  webCoverImageUrl?: string | null
  liveMeetupInfo?: { posterUrl?: string | null } | null
  location?: { city?: string | null; state?: string | null } | string | null
  registrationUrl?: string | null
}

function eventType(event: ArcHouseRawEvent): string {
  const name = String(event.name || "").toLowerCase()
  if (name.includes("hackathon")) return "Hackathon"
  if (name.includes("office hours")) return "Office Hours"
  if (name.includes("workshop")) return "Workshop"
  if (name.includes("conference") || name.includes("summit") || name.includes("pragma")) return "Conference"
  if (name.includes("demo day")) return "Demo Day"
  if (name.includes("launch")) return "Launch"
  const display = String(event.displayEventType || event.eventType || "").toLowerCase()
  if (display.includes("webinar")) return "Webinar"
  if (display.includes("livestream")) return "Community Call"
  if (display.includes("meeting")) return "Community Call"
  if (display.includes("in-person") || display.includes("meetup")) return "Meetup"
  return "Other"
}

function eventLocation(location: ArcHouseRawEvent["location"]): string | null {
  if (!location) return null
  if (typeof location === "string") return location.trim() || null
  return [location.city, location.state].map(value => String(value || "").trim()).filter(Boolean).join(", ") || null
}

export type ArcHouseEvent = {
  id: string
  name: string
  tagline: null
  type: string
  description: null
  date: string
  end_date: string | null
  timezone: string
  location: string | null
  is_online: boolean
  link: string
  source_url: string
  logo_url: string | null
  organizer: "Arc House"
  organizer_twitter: "https://x.com/arc"
  tags: string[]
  badge: "official"
  featured: false
  created_at: null
}

export async function fetchArcHouseEvents(): Promise<ArcHouseEvent[]> {
  try {
    const response = await fetch(ARC_HOUSE_EVENTS_URL, {
      headers: { Accept: "text/html", "User-Agent": "ArcLens Events/1.0 (+https://arclenz.xyz/events)" },
      next: { revalidate: 6 * 60 * 60 },
    })
    if (!response.ok) throw new Error(`Arc House returned ${response.status}`)

    const html = await response.text()
    const marker = '<script id="__NEXT_DATA__"'
    const scriptStart = html.indexOf(marker)
    if (scriptStart < 0) throw new Error("Arc House event data was not found")
    const jsonStart = html.indexOf(">", scriptStart) + 1
    const jsonEnd = html.indexOf("</script>", jsonStart)
    if (jsonStart <= 0 || jsonEnd < jsonStart) throw new Error("Arc House event data was incomplete")

    const payload = JSON.parse(html.slice(jsonStart, jsonEnd))
    const rawEvents: ArcHouseRawEvent[] = payload?.props?.pageProps?.events
    if (!Array.isArray(rawEvents)) throw new Error("Arc House events were not an array")

    const now = Date.now()
    return rawEvents.flatMap((event): ArcHouseEvent[] => {
      const id = String(event.id || "").trim()
      const slug = String(event.slug || "").trim()
      const name = String(event.name || "").trim()
      const date = String(event.startedAt || "").trim()
      if (!id || !slug || !name || !date || Number.isNaN(Date.parse(date))) return []
      const effectiveEnd = event.endedAt && !Number.isNaN(Date.parse(event.endedAt)) ? event.endedAt : date
      if (Date.parse(effectiveEnd) < now) return []

      const sourceUrl = `https://community.arc.io/public/events/${encodeURIComponent(slug)}`
      return [{
        id: `arc-house-${id}`,
        name,
        tagline: null,
        type: eventType(event),
        description: null,
        date,
        end_date: event.endedAt && !Number.isNaN(Date.parse(event.endedAt)) ? event.endedAt : null,
        timezone: String(event.timezone || "UTC"),
        location: eventLocation(event.location),
        is_online: event.isOnline === true,
        link: String(event.registrationUrl || "").trim() || sourceUrl,
        source_url: sourceUrl,
        logo_url: event.webCoverImageUrl || event.liveMeetupInfo?.posterUrl || null,
        organizer: "Arc House",
        organizer_twitter: "https://x.com/arc",
        tags: [],
        badge: "official",
        featured: false,
        created_at: null,
      }]
    })
  } catch (error) {
    console.error("[Arc House events]", error instanceof Error ? error.message : error)
    return []
  }
}
