"use client";

import { useState, type FormEvent } from "react";

// Firefox 3.6 on XP, 2010: menus, the keyhole back button, the address and
// search bars, tabs below the toolbars, and the Firefox Start Page. Anything
// you search or type opens for real in a new tab of the browser outside.

const MENUS = ["File", "Edit", "View", "History", "Bookmarks", "Tools", "Help"];
const BOOKMARKS = ["Most Visited", "Getting Started", "Latest Headlines"];
const HOME = "http://www.google.com/firefox?client=firefox-a&rls=org.mozilla:en-US:official";
const GBAR = ["Web", "Images", "Videos", "Maps", "News", "Shopping", "Books"];

function openOutside(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function search(q: string) {
  if (q.trim()) openOutside(`https://www.google.com/search?q=${encodeURIComponent(q.trim())}`);
}

// A typed address goes where it says; anything else is a search, as in Firefox.
function go(input: string) {
  const t = input.trim();
  if (!t || t === HOME) return;
  if (/^https?:\/\//i.test(t)) openOutside(t);
  else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) openOutside(`http://${t}`);
  else search(t);
}

export function Firefox() {
  const [address, setAddress] = useState(HOME);
  const [query, setQuery] = useState("");
  const [barQuery, setBarQuery] = useState("");

  const onAddress = (e: FormEvent) => {
    e.preventDefault();
    go(address);
    setAddress(HOME);
  };
  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    search(query);
  };
  const onBarSearch = (e: FormEvent) => {
    e.preventDefault();
    search(barQuery);
  };

  return (
    <div className="xp-app ff">
      <div className="xp-menubar">
        {MENUS.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="ff-nav">
        {/* Firefox 3.6's own toolbar sprite (MPL): the keyhole back/forward pair, then 24px buttons. */}
        <span className="ff-keyhole" aria-hidden="true">
          <button type="button" aria-label="Back" disabled />
          <button type="button" aria-label="Forward" disabled />
        </span>
        <button type="button" className="ff-btn ff-reload" aria-label="Reload" />
        <button type="button" className="ff-btn ff-stop" aria-label="Stop" disabled />
        <button type="button" className="ff-btn ff-home" aria-label="Home" onClick={() => setAddress(HOME)} />
        <form className="ff-url" onSubmit={onAddress}>
          {/* eslint-disable-next-line @next/next/no-img-element -- favicon-sized */}
          <img src="/pc/xp/firefox.png" width={16} height={16} alt="" />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Location"
            spellCheck={false}
          />
        </form>
        <form className="ff-search" onSubmit={onBarSearch}>
          <span className="ff-search-engine" aria-hidden="true">
            G
          </span>
          <input placeholder="Google" value={barQuery} onChange={(e) => setBarQuery(e.target.value)} aria-label="Search" />
        </form>
      </div>
      <div className="ff-bookmarks">
        {BOOKMARKS.map((b) => (
          <span key={b}>{b}</span>
        ))}
      </div>
      <div className="ff-tabs">
        <span className="ff-tab">
          {/* eslint-disable-next-line @next/next/no-img-element -- favicon-sized */}
          <img src="/pc/xp/firefox.png" width={16} height={16} alt="" />
          Mozilla Firefox Start Page
        </span>
        <span className="ff-newtab" aria-hidden="true">
          +
        </span>
      </div>
      <div className="ff-page">
        <div className="ffs-gbar">
          {GBAR.map((g, i) => (i === 0 ? <b key={g}>{g}</b> : <span key={g}>{g}</span>))}
          <span>
            <u>more</u> <small>&#9660;</small>
          </span>
        </div>
        {/* Google's Firefox Start page as archived in February 2010, drawn from its own sprites. */}
        <form className="ffs-frame" onSubmit={onSearch}>
          <div className="ffs-head">
            <div className="ffs-banner" title="Firefox Start" />
            <div className="ffs-grad" />
            <div className="ffs-logo" title="Firefox Logo" />
            <div className="ffs-logo-edge" />
          </div>
          <div className="ffs-box">
            <div className="ffs-google" title="Google" />
            <div className="ffs-row">
              <div>
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={256} aria-label="Google Search" />
                <br />
                <button type="submit">Google Search</button>
              </div>
              <span className="ffs-link">Advanced Search</span>
            </div>
          </div>
          <div className="ffs-foot">
            <div className="ffs-foot-left" />
            <div className="ffs-foot-line" />
            <div className="ffs-foot-right" />
          </div>
          <div className="ffs-snippet">
            {/* eslint-disable-next-line @next/next/no-img-element -- the page's own 40px badge */}
            <img src="/pc/xp/firefox-start/firefox.png" width={40} height={50} alt="" />
            <p>
              <span className="ffs-link">Firefox 3.6 is here!</span> With improved security, stability, personalization and
              more, the world&apos;s best browser just keeps getting better.
            </p>
          </div>
          <p className="ffs-about">
            <span className="ffs-link">About Mozilla</span>
          </p>
        </form>
      </div>
      <div className="status-bar">
        <p className="status-bar-field">Done</p>
      </div>
    </div>
  );
}
