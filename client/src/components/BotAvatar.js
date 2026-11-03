import React from "react";

/** Avatar for an AI model: gradient tile with a robot (chat) or paint (image) icon. */
export default function BotAvatar({ bot, size = 44 }) {
  const hue = [...(bot?.name || "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 200);
  return (
    <span
      className="avatar bot-avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 50) % 360} 70% 45%))`,
      }}
      aria-hidden="true"
    >
      <i className={`fa ${bot?.kind === "image" ? "fa-paint-brush" : "fa-android"}`} />
    </span>
  );
}

export const botLabel = (bot) => (bot ? `${bot.name} (${bot.model})` : "AI model");
