import React from "react";
import { formatName, getInitials } from "../utils/format";

/** User avatar: profile picture if present, otherwise coloured initials. */
export default function Avatar({ user, size = 44, online = false, className = "" }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  // Stable colour per user so initials are easy to tell apart.
  const hue = [...(user?._id || "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  return (
    <span className={`avatar ${className}`} style={style}>
      {user?.profilePic ? (
        <img src={user.profilePic} alt={formatName(user)} loading="lazy" />
      ) : (
        <span className="avatar-initials" style={{ background: `hsl(${hue} 55% 48%)` }} aria-hidden="true">
          {getInitials(user)}
        </span>
      )}
      {online && <span className="avatar-online" title="Online" />}
    </span>
  );
}
