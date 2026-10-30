import { BLURB, NAME, SOCIALS } from "../../../content";

const MENU = ["File", "Edit", "Format", "View", "Help"];

const TEXT = [
  NAME,
  "=".repeat(NAME.length),
  "",
  ...BLURB,
  "",
  "Currently open to new opportunities.",
  "",
  "Find me:",
  ...SOCIALS.map((s) => `  ${s.href.replace(/^(https?:\/\/|mailto:)/, "")}`),
  "",
].join("\n");

export function About() {
  return (
    <div className="xp-app xp-notepad">
      <div className="xp-menubar">
        {MENU.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <pre className="xp-notepad-text">{TEXT}</pre>
    </div>
  );
}
