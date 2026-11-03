import React from "react";

/** Avatar for a group: initials of the group name on a colour derived from its id. */
export default function GroupAvatar({ chat, size = 44 }) {
  const words = (chat?.name || "Group").trim().split(/\s+/);
  const initials = ((words[0]?.[0] || "") + (words[1]?.[0] || "")).toUpperCase() || "G";
  const hue = [...(chat?._id || chat?.name || "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 120);
  return (
    <span
      className="avatar group-avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `linear-gradient(135deg, hsl(${hue} 60% 50%), hsl(${(hue + 40) % 360} 60% 40%))`,
      }}
      aria-hidden="true"
    >
      {initials}
      <span className="group-avatar-badge">
        <i className="fa fa-users" />
      </span>
    </span>
  );
}
