"use client"
//
// LensFace — the Lens AI character. A struck Arc-blue lepton coin with a
// brushed-metal rim, a recessed glass face, lens-aperture eyes with catchlights,
// an Arc-shaped mouth, and a slow specular glint. It REACTS to the agent:
//   idle       calm blink + gentle bob
//   thinking   eyes scan up, apertures spin, pulse ring
//   paying     green eyes, a wink, coins spark out
//   confident  steady, narrowed, held glow
//   dontknow   eyes glance away, honest flat arc
// Pure SVG + CSS, scales to any size.

export type LensState = "idle" | "thinking" | "paying" | "confident" | "dontknow" | "spin" | "smug"

let UID = 0
export default function LensFace({ state = "idle", size = 32 }: { state?: LensState; size?: number }) {
  // Unique gradient/clip ids so multiple coins on a page don't collide.
  const u = (typeof window !== "undefined" ? (UID = (UID + 1) % 1e6) : 0)
  const id = (s: string) => `lf${u}-${s}`
  return (
    <div className={`lf-coin lf-${state}`} style={{ width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <radialGradient id={id("rim")} cx="36%" cy="28%" r="82%">
            <stop offset="0%" stopColor="#bcd0ff" /><stop offset="30%" stopColor="#6f97ff" />
            <stop offset="62%" stopColor="#3b6bff" /><stop offset="100%" stopColor="#19256e" />
          </radialGradient>
          <radialGradient id={id("shade")} cx="72%" cy="78%" r="62%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.45)" /><stop offset="70%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id={id("face")} cx="50%" cy="34%" r="75%">
            <stop offset="0%" stopColor="#1b2336" /><stop offset="55%" stopColor="#0d1322" /><stop offset="100%" stopColor="#05070e" />
          </radialGradient>
          <radialGradient id={id("iris")} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#11203f" /><stop offset="100%" stopColor="#070b16" />
          </radialGradient>
          <radialGradient id={id("spec")} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.9)" /><stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <linearGradient id={id("sheen")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" /><stop offset="50%" stopColor="rgba(255,255,255,0.5)" /><stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <clipPath id={id("clip")}><circle cx="100" cy="100" r="80" /></clipPath>
          <filter id={id("soft")}><feGaussianBlur stdDeviation="2.4" /></filter>
        </defs>

        {/* rim + metal shading */}
        <circle cx="100" cy="100" r="94" fill={`url(#${id("rim")})`} />
        <circle cx="100" cy="100" r="94" fill={`url(#${id("shade")})`} />
        <circle cx="100" cy="100" r="94" fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="1.5" strokeDasharray="1.5 4" />
        {/* top rim light + bottom rim shadow */}
        <path d="M28 70 A80 80 0 0 1 172 70" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        <path d="M30 132 A80 80 0 0 0 170 132" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="100" cy="100" r="84" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2" />

        {/* recessed glass face */}
        <circle cx="100" cy="100" r="80" fill={`url(#${id("face")})`} />
        <ellipse cx="100" cy="46" rx="58" ry="20" fill="rgba(255,255,255,0.05)" />
        <ellipse cx="66" cy="50" rx="30" ry="17" fill={`url(#${id("spec")})`} opacity="0.4" filter={`url(#${id("soft")})`} />

        {/* moving specular glint, clipped to the face */}
        <g clipPath={`url(#${id("clip")})`}>
          <g className="lf-sheen"><rect x="-30" y="-40" width="30" height="280" fill={`url(#${id("sheen")})`} transform="rotate(18 0 100)" /></g>
        </g>

        {/* glows + thinking ring */}
        <circle className="lf-glow lf-green" cx="100" cy="100" r="94" fill="none" stroke="#00c896" strokeWidth="3" filter={`url(#${id("soft")})`} />
        <circle className="lf-glow lf-blue"  cx="100" cy="100" r="94" fill="none" stroke="#5b8cff" strokeWidth="3" filter={`url(#${id("soft")})`} />
        <circle className="lf-ring" cx="100" cy="100" r="94" fill="none" stroke="#3b6bff" strokeWidth="2.5" />

        {/* eyes */}
        {eye(72, "", id)}
        {eye(128, "lf-eye-r", id)}

        {/* mouths */}
        <path className="lf-mouth lf-m-smile"       d="M82 132 Q100 147 118 132" fill="none" stroke="#cfe0ff" strokeWidth="4.5" strokeLinecap="round" />
        <path className="lf-mouth lf-m-grin"        d="M77 130 Q100 156 123 130" fill="none" stroke="#aaffe2" strokeWidth="5"   strokeLinecap="round" />
        <path className="lf-mouth lf-m-flatsmile"   d="M84 134 Q100 142 116 134" fill="none" stroke="#cfe0ff" strokeWidth="4.5" strokeLinecap="round" />
        <path className="lf-mouth lf-m-concentrate" d="M86 136 L114 136"         fill="none" stroke="#cfe0ff" strokeWidth="4.5" strokeLinecap="round" />
        <path className="lf-mouth lf-m-flat"        d="M85 135 Q100 131 115 135" fill="none" stroke="#9aa6bf" strokeWidth="4.5" strokeLinecap="round" />
        <path className="lf-mouth lf-m-smirk"       d="M80 133 Q106 143 120 128" fill="none" stroke="#cfe0ff" strokeWidth="4.5" strokeLinecap="round" />

        {/* pay sparks */}
        <circle className="lf-spark lf-s1" cx="122" cy="100" r="5"   fill="#00c896" />
        <circle className="lf-spark lf-s2" cx="122" cy="100" r="3.5" fill="#7affd2" />
        <circle className="lf-spark lf-s3" cx="122" cy="100" r="4"   fill="#00c896" />
      </svg>

      <style>{`
        .lf-coin{animation:lf-float 4s ease-in-out infinite;transform-origin:center;will-change:transform}
        .lf-pupil{transition:transform .35s cubic-bezier(.3,1,.4,1)}
        .lf-iris{transition:stroke .3s ease,filter .3s ease}
        .lf-lid{transform-origin:center;transform:scaleY(0)}
        .lf-eyeG{transform-origin:center}
        .lf-mouth{display:none}
        .lf-glow{opacity:0;transition:opacity .4s ease}
        .lf-ring{opacity:0;transform-origin:center}
        .lf-spark{opacity:0}
        .lf-sheen{animation:lf-sheen 6s ease-in-out infinite}

        .lf-idle .lf-eyeG{animation:lf-blink 5.2s infinite}
        .lf-idle .lf-pupil{animation:lf-look 9s ease-in-out infinite}
        .lf-idle .lf-m-smile{display:block}

        .lf-thinking .lf-pupil{transform:translateY(-4px)}
        .lf-thinking .lf-iris{animation:lf-spin 3s linear infinite}
        .lf-thinking .lf-ring{opacity:1;animation:lf-pulse 1.8s ease-out infinite}
        .lf-thinking .lf-m-concentrate{display:block}

        .lf-paying .lf-iris{stroke:#00c896;filter:drop-shadow(0 0 5px rgba(0,200,150,.85))}
        .lf-paying .lf-pupil{fill:#caffe9}
        .lf-paying .lf-eye-r .lf-eyeG{animation:lf-wink 1.6s ease-in-out infinite}
        .lf-paying .lf-glow.lf-green{opacity:1;animation:lf-breathe 1.6s ease-in-out infinite}
        .lf-paying .lf-m-grin{display:block}
        .lf-paying .lf-spark{animation:lf-fly 1.6s ease-out infinite}
        .lf-paying .lf-s2{animation-delay:.5s}
        .lf-paying .lf-s3{animation-delay:1s}

        .lf-confident .lf-lid{transform:scaleY(.42)}
        .lf-confident .lf-iris{stroke:#7aa0ff}
        .lf-confident .lf-glow.lf-blue{opacity:.9}
        .lf-confident .lf-m-flatsmile{display:block}

        .lf-dontknow .lf-pupil{transform:translate(4px,-3px)}
        .lf-dontknow .lf-iris{stroke:#6b7488}
        .lf-dontknow .lf-m-flat{display:block}

        .lf-smug .lf-m-smirk{display:block}
        .lf-smug .lf-eye-r .lf-lid{transform:scaleY(0.5)}
        .lf-smug .lf-iris{stroke:#7aa0ff}

        .lf-spin{animation:lf-flip 1s ease-in-out 2}
        .lf-spin .lf-m-grin{display:block}
        .lf-spin .lf-iris{stroke:#00c896}

        @keyframes lf-float{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-6%) rotate(1deg) scale(1.015)}}
        @keyframes lf-look{0%,60%,100%{transform:translate(0,0)}70%{transform:translate(4px,-1.5px)}82%{transform:translate(-4px,-1.5px)}}
        @keyframes lf-flip{0%{transform:rotateY(0) translateY(0)}50%{transform:rotateY(180deg) translateY(-9%)}100%{transform:rotateY(360deg) translateY(0)}}
        @keyframes lf-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}
        @keyframes lf-wink{0%,40%,100%{transform:scaleY(1)}50%,60%{transform:scaleY(.08)}}
        @keyframes lf-spin{to{transform:rotate(360deg)}}
        @keyframes lf-pulse{0%{transform:scale(.7);opacity:.55}100%{transform:scale(1.35);opacity:0}}
        @keyframes lf-breathe{0%,100%{opacity:.55}50%{opacity:1}}
        @keyframes lf-fly{0%{opacity:0;transform:translate(0,0) scale(.5)}15%{opacity:1}100%{opacity:0;transform:translate(54px,-46px) scale(1)}}
        @keyframes lf-sheen{0%,100%{transform:translateX(-30px);opacity:0}45%{opacity:.9}55%{opacity:.9}90%{transform:translateX(250px);opacity:0}}
        @media (prefers-reduced-motion: reduce){.lf-coin,.lf-eyeG,.lf-iris,.lf-ring,.lf-spark,.lf-sheen{animation:none!important}}
      `}</style>
    </div>
  )
}

function eye(cx: number, cls: string, id: (s: string) => string) {
  const pts = [0, 1, 2, 3, 4, 5].map(i => {
    const a = Math.PI / 2 + i * Math.PI / 3
    return `${(cx + 16 * Math.cos(a)).toFixed(1)},${(92 + 16 * Math.sin(a)).toFixed(1)}`
  }).join(" ")
  return (
    <g className={cls} key={cx}>
      <g className="lf-eyeG">
        <circle cx={cx} cy="92" r="18" fill={`url(#${id("iris")})`} />
        <circle className="lf-iris" cx={cx} cy="92" r="19" fill="none" stroke="#3b6bff" strokeWidth="3.5" />
        <polygon className="lf-iris" points={pts} fill="none" stroke="#3b6bff" strokeWidth="1.5" opacity="0.5" />
        <circle className="lf-pupil" cx={cx} cy="92" r="8" fill="#eaf1ff" />
        <circle cx={cx - 3.5} cy="87.5" r="2.8" fill="#fff" />
        <circle cx={cx + 4} cy="96" r="1.5" fill="#fff" opacity="0.6" />
      </g>
      <rect className="lf-lid" x={cx - 22} y="70" width="44" height="46" rx="6" fill="#0d1322" />
    </g>
  )
}
