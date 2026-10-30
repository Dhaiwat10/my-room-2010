"use client";

// MS Paint, as jspaint (MIT, github.com/1j01/jspaint) served from
// /public/jspaint: same origin, so it frames fine under COEP.

function prepare() {
  try {
    // Classic look all year: no winter theme in December.
    localStorage["jspaint theme"] = "classic.css";
    localStorage["jspaint disable seasonal theme"] = "true";
  } catch {}
  return "/pc/jspaint/index.html";
}

export function Paint() {
  return (
    <div className="xp-app xp-paint">
      <iframe src={prepare()} title="Paint" />
    </div>
  );
}
