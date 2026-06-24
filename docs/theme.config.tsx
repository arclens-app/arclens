import React from "react"
import { DocsThemeConfig, useConfig } from "nextra-theme-docs"

const Logo = (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
    <span style={{ fontWeight: 800, letterSpacing: "-0.03em", fontSize: 18 }}>
      Arc<span style={{ color: "#1a56ff" }}>Lens</span>
    </span>
    <span style={{ fontWeight: 400, fontSize: 14, opacity: 0.55 }}>Docs</span>
  </span>
)

const config: DocsThemeConfig = {
  logo: Logo,
  project: {
    link: "https://github.com/arclens-app/arclens",
  },
  docsRepositoryBase: "https://github.com/arclens-app/arclens/tree/main/docs",
  color: {
    hue: 222,
    saturation: 90,
  },
  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },
  toc: {
    backToTop: true,
    title: "On this page",
  },
  editLink: {
    content: "Edit this page on GitHub →",
  },
  feedback: {
    content: "Question? Give us feedback →",
    labels: "feedback",
  },
  footer: {
    content: (
      <span style={{ fontSize: 13 }}>
        © {new Date().getFullYear()} ArcLens · the ecosystem &amp; intelligence hub for Arc ·{" "}
        <a href="https://arclenz.xyz" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
          arclenz.xyz
        </a>
      </span>
    ),
  },
  head: function Head() {
    const { title } = useConfig()
    const page = title ? `${title} — ArcLens Docs` : "ArcLens Docs"
    return (
      <>
        <title>{page}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta property="og:title" content={page} />
        <meta property="og:description" content="Documentation for ArcLens — the ecosystem & intelligence hub for Arc, and the Lens AI Agent API." />
        <meta name="description" content="Documentation for ArcLens — the ecosystem & intelligence hub for Arc, and the Lens AI Agent API." />
        <link rel="icon" href="https://arclenz.xyz/favicon.ico" />
      </>
    )
  },
  banner: {
    key: "lens-ai-live",
    content: (
      <span>
        🪙 Lens AI is live — the agent that pays the builders it learns from.{" "}
        <a href="https://arclenz.xyz/lens" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
          Try it →
        </a>
      </span>
    ),
  },
  darkMode: true,
  nextThemes: {
    defaultTheme: "dark",
  },
}

export default config
