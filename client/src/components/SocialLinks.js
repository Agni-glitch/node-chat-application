import React from "react";
import { SOCIAL_PLATFORMS } from "../config";

const isSafeUrl = (url) => /^https?:\/\//i.test(url || "");

const display = (url) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

/** Read-only list of a user's profile links. */
export default function SocialLinks({ links, emptyText = "No links added yet." }) {
  const items = SOCIAL_PLATFORMS.filter((p) => isSafeUrl(links?.[p.key]));
  if (items.length === 0) return <p className="social-empty">{emptyText}</p>;
  return (
    <ul className="social-list">
      {items.map((p) => (
        <li key={p.key}>
          <a href={links[p.key]} target="_blank" rel="noopener noreferrer nofollow" className="social-link">
            <span className={`social-icon social-${p.key}`}>
              <i className={`fa ${p.icon}`} aria-hidden="true" />
            </span>
            <span className="social-text">
              <span className="social-label">{p.label}</span>
              <span className="social-url">{display(links[p.key])}</span>
            </span>
            <i className="fa fa-external-link social-external" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}
